"""Lectura del Word de un quiz: convierte el .docx en una lista de tarjetas.

Solo se leen las tablas del documento ("tarjetas"); el texto fuera de ellas son notas del
académico y se ignora. Cada tarjeta tiene un encabezado (primera fila) y filas
etiqueta / valor. La interpretación de cada tarjeta está en quiz_validator.py.
"""

import hashlib
import io
import unicodedata
import zipfile
from dataclasses import dataclass, field

from docx import Document
from docx.opc.exceptions import PackageNotFoundError


class QuizDocumentError(Exception):
    """El archivo no es un Word (.docx) que se pueda leer."""


@dataclass
class CardImage:
    data: bytes
    content_type: str
    sha256: str

    @property
    def extension(self) -> str:
        return {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/gif": "gif",
            "image/webp": "webp",
        }.get(self.content_type, "bin")


@dataclass
class CardRow:
    label: str            # etiqueta tal como la escribió el académico ("Respuesta correcta")
    key: str              # etiqueta normalizada ("RESPUESTA CORRECTA")
    lines: list[str]      # renglones no vacíos de la columna de valores
    images: list[CardImage] = field(default_factory=list)


@dataclass
class Card:
    number: int           # posición de la tabla en el documento (1, 2, 3...)
    header: str           # encabezado tal como está ("PREGUNTA · OPCIÓN MÚLTIPLE")
    header_key: str       # encabezado normalizado ("PREGUNTA OPCION MULTIPLE")
    rows: list[CardRow]


def normalize(text: str) -> str:
    """Mayúsculas, sin acentos ni signos, espacios simples: 'Opción  múltiple' -> 'OPCION MULTIPLE'."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = "".join(c if c.isalnum() else " " for c in text.upper())
    return " ".join(text.split())


def _cell_lines(cell) -> list[str]:
    lines = []
    for paragraph in cell.paragraphs:
        # Un salto de línea manual (Shift+Enter) también separa renglones
        for line in paragraph.text.replace("\v", "\n").split("\n"):
            line = line.strip()
            if line:
                lines.append(line)
    return lines


_BLIP = "{http://schemas.openxmlformats.org/drawingml/2006/main}blip"
_VML_IMAGE = "{urn:schemas-microsoft-com:vml}imagedata"
_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def _cell_images(cell, document) -> list[CardImage]:
    """Imágenes pegadas en la celda (formato actual y el antiguo VML de Word)."""
    ids = []
    for element in cell._tc.iter():
        if element.tag == _BLIP and element.get(_R + "embed"):
            ids.append(element.get(_R + "embed"))
        elif element.tag == _VML_IMAGE and element.get(_R + "id"):
            ids.append(element.get(_R + "id"))
    images = []
    for rel_id in ids:
        part = document.part.related_parts.get(rel_id)
        if part is None:
            continue
        data = part.blob
        images.append(CardImage(
            data=data,
            content_type=part.content_type,
            sha256=hashlib.sha256(data).hexdigest(),
        ))
    return images


def read_cards(data: bytes) -> list[Card]:
    """Devuelve las tarjetas del documento en orden. Lanza QuizDocumentError si no es un .docx."""
    if not zipfile.is_zipfile(io.BytesIO(data)):
        raise QuizDocumentError(
            "El archivo no es un documento de Word (.docx). "
            "Si es un .doc antiguo, ábrelo en Word y guárdalo como 'Documento de Word (.docx)'."
        )
    try:
        document = Document(io.BytesIO(data))
    except (PackageNotFoundError, KeyError, ValueError) as error:
        raise QuizDocumentError("No se pudo abrir el documento de Word.") from error

    cards = []
    for number, table in enumerate(document.tables, start=1):
        if not table.rows:
            continue
        header_cells = table.rows[0].cells
        header = " ".join(_cell_lines(header_cells[0]))

        rows = []
        for row in table.rows[1:]:
            cells = row.cells
            if not cells:
                continue
            label_lines = _cell_lines(cells[0])
            # La primera línea es la etiqueta; la segunda (gris) es la pista y se ignora
            label = label_lines[0] if label_lines else ""
            # Si la fila tiene las dos columnas combinadas no hay valor (no se toma la etiqueta)
            value_cell = cells[-1] if len(cells) > 1 and cells[-1]._tc is not cells[0]._tc else None
            rows.append(CardRow(
                label=label,
                key=normalize(label),
                lines=_cell_lines(value_cell) if value_cell is not None else [],
                images=_cell_images(value_cell, document) if value_cell is not None else [],
            ))

        cards.append(Card(number=number, header=header, header_key=normalize(header), rows=rows))
    return cards
