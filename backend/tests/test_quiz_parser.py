"""Pruebas del lector del Word de quizzes.

Caso base: la plantilla aprobada por el académico (docs/quiz/Plantilla_Quiz_ActivaIngles.docx).
Las demás pruebas toman esa plantilla, le cambian una celda o quitan una tarjeta, y revisan
que el reporte diga qué está mal y dónde.
"""

import io
from copy import deepcopy
from pathlib import Path

import pytest
from docx import Document

from app.services.quiz_parser import normalize, read_cards
from app.services.quiz_validator import analyze_docx

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "docs" / "quiz" / "Plantilla_Quiz_ActivaIngles.docx"
GUIDE = ROOT / "docs" / "quiz" / "Guia_Crear_Quiz.docx"

# Posición de cada tarjeta en la plantilla (índice de tabla)
DATOS, S1, Q1_MC, Q2_TF, S2, Q3_MATCH, Q4_MC_IMG, S3, Q5_FILL, Q6_FILL, Q7_FILL, S4, Q8_OPEN = range(13)


def template_document() -> Document:
    return Document(str(TEMPLATE))


def to_bytes(document: Document) -> bytes:
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def set_value(document: Document, table: int, label: str, *lines: str) -> None:
    """Reemplaza el valor de la fila cuya etiqueta empieza con `label` (un párrafo por renglón)."""
    for row in document.tables[table].rows[1:]:
        if normalize(row.cells[0].paragraphs[0].text).startswith(normalize(label)):
            cell = row.cells[-1]
            for paragraph in cell.paragraphs[1:]:
                paragraph._element.getparent().remove(paragraph._element)
            cell.paragraphs[0].text = lines[0] if lines else ""
            for line in lines[1:]:
                cell.add_paragraph(line)
            return
    raise AssertionError(f"No existe la fila {label!r} en la tabla {table}")


def remove_table(document: Document, table: int) -> None:
    element = document.tables[table]._element
    element.getparent().remove(element)


def paste_copy(document: Document, table: int) -> None:
    """Copia una tarjeta al final del documento, con un renglón vacío antes (como hace el académico)."""
    body = document.element.body
    end = body.sectPr if body.sectPr is not None else None
    for element in (document.add_paragraph()._element, deepcopy(document.tables[table]._element)):
        if end is not None:
            end.addprevious(element)
        else:
            body.append(element)


def analyze(document: Document):
    return analyze_docx(to_bytes(document))


def messages(build, level="error") -> list[str]:
    return [i["message"] for i in build.report["items"] if i["level"] == level]


def questions(build) -> list[dict]:
    return [q for s in build.definition["sections"] for q in s["questions"]]


# ─────────────── Plantilla aprobada ───────────────

@pytest.fixture(scope="module")
def template():
    return analyze_docx(TEMPLATE.read_bytes())


def test_plantilla_sin_errores_ni_advertencias(template):
    assert template.report["errorCount"] == 0
    assert template.report["warningCount"] == 0
    assert template.report["summary"] == "Se detectaron 4 secciones y 8 preguntas (14 puntos en total)."
    assert template.ok


def test_plantilla_datos_del_quiz(template):
    d = template.definition
    assert d["title"] == "Quiz 1 · Greetings and Introductions"
    assert d["passingScore"] == 70
    assert d["maxAttempts"] == 2
    assert d["timeLimitMinutes"] == 20
    assert d["totalPoints"] == 14
    assert d["questionCount"] == 8
    assert d["schemaVersion"] == 1


def test_plantilla_secciones_y_claves(template):
    sections = template.definition["sections"]
    assert [s["name"] for s in sections] == ["Listening", "Vocabulary", "Grammar", "Writing"]
    assert [q["key"] for q in questions(template)] == [
        "S1-P1", "S1-P2", "S2-P1", "S2-P2", "S3-P1", "S3-P2", "S3-P3", "S4-P1"]
    assert [q["number"] for q in questions(template)] == list(range(1, 9))
    assert sections[0]["media"] == {"kind": "file", "mediaType": "AUDIO", "fileName": "dialogo_saludos.mp3"}


def test_plantilla_cada_tipo_de_pregunta(template):
    q = questions(template)
    assert q[0]["type"] == "multiple_choice"
    assert q[0]["options"] == [
        {"key": "a", "text": "In the morning"},
        {"key": "b", "text": "In the afternoon"},
        {"key": "c", "text": "At night"}]
    assert q[0]["answer"] == "a" and q[0]["points"] == 2
    assert q[0]["feedback"].startswith("They say")

    assert q[1]["type"] == "true_false" and q[1]["answer"] is False

    assert q[2]["type"] == "matching"
    assert q[2]["pairs"][0] == {"left": "Good morning", "right": "Buenos días"}
    assert len(q[2]["pairs"]) == 4 and q[2]["points"] == 4

    assert q[3]["answer"] == "b" and q[3]["image"]["contentType"] == "image/png"

    assert q[4]["prompt"] == "Nice to ___ you." and q[4]["acceptedAnswers"] == ["meet"]
    assert q[6]["acceptedAnswers"] == ["My", "Her"]

    assert q[7]["type"] == "open"
    assert len(q[7]["criteria"]) == 4
    assert q[7]["modelAnswer"].startswith("Hello! My name is Carlos")


def test_plantilla_archivos(template):
    assert template.required_files == ["dialogo_saludos.mp3"]
    image_name = questions(template)[3]["image"]["fileName"]
    assert image_name in template.images
    assert template.images[image_name].data.startswith(b"\x89PNG")
    kinds = {m["fileName"]: m["mediaType"] for m in template.media}
    assert kinds == {image_name: "IMAGE", "dialogo_saludos.mp3": "AUDIO"}


def test_quiz_mas_grande_con_seis_secciones():
    """El lector no espera una cantidad fija: cada tema puede tener las secciones y preguntas que necesite."""
    document = template_document()
    for table in (S2, Q1_MC, Q5_FILL, Q8_OPEN, S3, Q2_TF, Q3_MATCH):
        paste_copy(document, table)
    build = analyze(document)
    assert build.ok and build.report["warningCount"] == 0
    assert build.report["summary"] == "Se detectaron 6 secciones y 13 preguntas (25 puntos en total)."
    sections = build.definition["sections"]
    assert [len(s["questions"]) for s in sections] == [2, 2, 3, 1, 3, 2]
    assert [q["key"] for q in sections[4]["questions"]] == ["S5-P1", "S5-P2", "S5-P3"]
    assert [q["number"] for q in questions(build)] == list(range(1, 14))


def test_quiz_minimo_una_seccion_una_pregunta():
    document = template_document()
    for table in sorted((S2, Q3_MATCH, Q4_MC_IMG, S3, Q5_FILL, Q6_FILL, Q7_FILL, S4, Q8_OPEN, Q2_TF), reverse=True):
        remove_table(document, table)
    build = analyze(document)
    assert build.ok
    assert build.report["summary"] == "Se detectaron 1 sección y 1 pregunta (2 puntos en total)."


def test_texto_fuera_de_las_tarjetas_se_ignora():
    document = template_document()
    document.add_paragraph("Nota para mí: revisar el audio con la coordinación.")
    document.paragraphs[0].insert_paragraph_before("Borrador del quiz, versión 3")
    build = analyze(document)
    assert build.report["errorCount"] == 0 and build.report["warningCount"] == 0


def test_la_guia_con_tarjetas_en_blanco_no_rompe_el_lector():
    build = analyze_docx(GUIDE.read_bytes())
    assert build.report["errorCount"] > 0
    assert "Datos del quiz: falta el título." in messages(build)


# ─────────────── Errores del académico ───────────────

def test_respuesta_que_no_existe_entre_las_opciones():
    document = template_document()
    set_value(document, Q1_MC, "Respuesta correcta", "d")
    assert messages(analyze(document)) == [
        "Pregunta 1 (opción múltiple): la respuesta «d» no existe entre las opciones (a, b, c)."]


def test_respuesta_escrita_con_el_texto_de_la_opcion():
    document = template_document()
    set_value(document, Q1_MC, "Respuesta correcta", "a) In the morning")
    build = analyze(document)
    assert build.ok and questions(build)[0]["answer"] == "a"


def test_opcion_sin_letra():
    document = template_document()
    set_value(document, Q1_MC, "Opciones", "a) In the morning", "In the afternoon", "c) At night")
    assert "debe empezar con una letra" in messages(analyze(document))[0]


def test_verdadero_o_falso_invalido():
    document = template_document()
    set_value(document, Q2_TF, "Respuesta correcta", "Tal vez")
    assert messages(analyze(document)) == [
        "Pregunta 2 (verdadero o falso): en «Respuesta correcta» escribe Verdadero o Falso (se escribió «Tal vez»)."]


@pytest.mark.parametrize("text, expected", [("V", True), ("falso", False), ("Verdadero.", True)])
def test_verdadero_o_falso_variantes(text, expected):
    document = template_document()
    set_value(document, Q2_TF, "Respuesta correcta", text)
    assert questions(analyze(document))[1]["answer"] is expected


def test_completar_sin_espacio():
    document = template_document()
    set_value(document, Q5_FILL, "Oración", "Nice to meet you.")
    assert "marca el espacio" in messages(analyze(document))[0]


def test_completar_con_dos_espacios():
    document = template_document()
    set_value(document, Q5_FILL, "Oración", "___ to ___ you.")
    assert "solo se permite un espacio" in messages(analyze(document))[0]


def test_completar_con_mas_guiones_se_normaliza():
    document = template_document()
    set_value(document, Q5_FILL, "Oración", "Nice to ______ you.")
    build = analyze(document)
    assert build.ok and questions(build)[4]["prompt"] == "Nice to ___ you."


def test_par_sin_signo_igual():
    document = template_document()
    set_value(document, Q3_MATCH, "Pares", "Good morning = Buenos días", "Good night Buenas noches",
              "See you later = Hasta luego")
    assert messages(analyze(document)) == [
        "Pregunta 3 (relacionar): el par «Good night Buenas noches» no tiene el signo =. "
        "Escríbelo así: Good morning = Buenos días."]


def test_respuesta_abierta_sin_criterios():
    document = template_document()
    set_value(document, Q8_OPEN, "Criterios de evaluación")
    assert "al menos un criterio" in messages(analyze(document))[0]


def test_pregunta_antes_de_cualquier_seccion():
    document = template_document()
    remove_table(document, S1)
    errors = messages(analyze(document))
    assert "Pregunta 1: está antes de cualquier tarjeta SECCIÓN; agrega una sección arriba de ella." in errors


def test_puntos_vacios_valen_uno_con_advertencia():
    document = template_document()
    set_value(document, Q1_MC, "Puntos")
    build = analyze(document)
    assert build.ok
    assert messages(build, "warning") == ["Pregunta 1 (opción múltiple): no tiene puntos; se le asignará 1."]
    assert questions(build)[0]["points"] == 1
    assert build.definition["totalPoints"] == 13


def test_puntos_invalidos():
    document = template_document()
    set_value(document, Q1_MC, "Puntos", "cero")
    assert "los puntos deben ser un número mayor que 0" in messages(analyze(document))[0]


def test_datos_del_quiz_invalidos():
    document = template_document()
    set_value(document, DATOS, "Título")
    set_value(document, DATOS, "Calificación para aprobar", "150")
    set_value(document, DATOS, "Intentos permitidos", "dos")
    errors = messages(analyze(document))
    assert "Datos del quiz: falta el título." in errors
    assert any("de 0 a 100" in e for e in errors)
    assert any("los intentos permitidos debe ser un número entero" in e for e in errors)


def test_intentos_y_tiempo_vacios_son_sin_limite():
    document = template_document()
    set_value(document, DATOS, "Intentos permitidos")
    set_value(document, DATOS, "Tiempo límite")
    build = analyze(document)
    assert build.ok
    assert build.definition["maxAttempts"] is None and build.definition["timeLimitMinutes"] is None


def test_calificacion_con_porcentaje():
    document = template_document()
    set_value(document, DATOS, "Calificación para aprobar", "80%")
    assert analyze(document).definition["passingScore"] == 80


def test_enlace_de_youtube():
    document = template_document()
    set_value(document, S1, "Audio o video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    build = analyze(document)
    assert build.ok
    assert build.definition["sections"][0]["media"]["videoId"] == "dQw4w9WgXcQ"
    assert build.required_files == []
    assert any(m["mediaType"] == "LINK" for m in build.media)


def test_enlace_que_no_es_de_youtube():
    document = template_document()
    set_value(document, S1, "Audio o video", "https://drive.google.com/file/d/abc")
    assert "solo se aceptan enlaces de YouTube" in messages(analyze(document))[0]


@pytest.mark.parametrize("value, fragment", [
    ("dialogo", "con su extensión"),
    ("dialogo.ogg", "el formato .ogg no se acepta"),
    ("foto.png", "las imágenes se pegan en la fila «Imagen»"),
])
def test_archivos_de_audio_invalidos(value, fragment):
    document = template_document()
    set_value(document, S1, "Audio o video", value)
    assert fragment in messages(analyze(document))[0]


def test_nombre_de_archivo_con_espacios_es_advertencia():
    document = template_document()
    set_value(document, S1, "Audio o video", "Diálogo 1.mp3")
    build = analyze(document)
    assert build.ok and "tiene espacios, acentos o símbolos" in messages(build, "warning")[0]
    assert build.required_files == ["Diálogo 1.mp3"]


def test_mismo_audio_en_dos_lugares_se_pide_una_vez():
    document = template_document()
    set_value(document, Q1_MC, "Audio o video", "dialogo_saludos.mp3")
    assert analyze(document).required_files == ["dialogo_saludos.mp3"]


def test_seccion_sin_preguntas_es_advertencia():
    document = template_document()
    remove_table(document, Q8_OPEN)
    build = analyze(document)
    assert build.ok and messages(build, "warning") == ["Sección 4 (Writing): no tiene preguntas."]


def test_sin_tarjeta_de_datos():
    document = template_document()
    remove_table(document, DATOS)
    assert "Falta la tarjeta DATOS DEL QUIZ al inicio del documento." in messages(analyze(document))


def test_tipo_de_pregunta_desconocido():
    document = template_document()
    document.tables[Q1_MC].rows[0].cells[0].paragraphs[0].text = "PREGUNTA · ORDENAR PALABRAS"
    assert "el tipo «PREGUNTA · ORDENAR PALABRAS» no se reconoce" in messages(analyze(document))[0]


def test_tabla_ajena_se_ignora_con_advertencia():
    document = template_document()
    table = document.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Calendario"
    build = analyze(document)
    assert build.ok and messages(build, "warning") == [
        "Se ignoró la tabla 14: no es una tarjeta del quiz (su encabezado es «Calendario»)."]


def test_archivo_que_no_es_word():
    build = analyze_docx(b"esto no es un documento")
    assert not build.ok
    assert "no es un documento de Word (.docx)" in messages(build)[0]


def test_normalize():
    assert normalize("PREGUNTA · OPCIÓN  MÚLTIPLE") == "PREGUNTA OPCION MULTIPLE"
    assert normalize("Tiempo límite (minutos)") == "TIEMPO LIMITE MINUTOS"


def test_read_cards_separa_etiqueta_y_pista():
    cards = read_cards(TEMPLATE.read_bytes())
    row = cards[DATOS].rows[1]
    assert row.label == "Instrucciones generales" and row.key == "INSTRUCCIONES GENERALES"
    assert row.lines[0].startswith("Este quiz evalúa")
