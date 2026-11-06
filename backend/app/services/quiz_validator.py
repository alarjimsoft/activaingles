"""Interpretación y validación del quiz leído del Word.

build_quiz(cards) convierte las tarjetas de quiz_parser en:
  - definition: el quiz completo (con respuestas) que se guarda en QUIZ_VERSIONS.DEFINITION_JSON
  - report: el reporte para el académico, con errores (impiden publicar) y advertencias
  - images: imágenes pegadas en el Word, listas para subir al bucket
  - media: filas para QUIZ_MEDIA (imágenes, audios/videos citados y enlaces de YouTube)

Los mensajes del reporte siguen el tono de la Guía para crear un quiz: español sencillo,
diciendo dónde está el problema y cómo corregirlo.
"""

import re
from dataclasses import dataclass, field

from app.services.quiz_parser import Card, CardImage, CardRow, QuizDocumentError, normalize, read_cards

SCHEMA_VERSION = 1
DEFAULT_PASSING_SCORE = 70
MAX_IMAGE_BYTES = 2 * 1024 * 1024

AUDIO_TYPES = {"mp3": "audio/mpeg", "m4a": "audio/mp4", "wav": "audio/wav"}
VIDEO_TYPES = {"mp4": "video/mp4"}
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
BROWSER_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}

QUESTION_TYPES = {
    "OPCION MULTIPLE": "multiple_choice",
    "VERDADERO O FALSO": "true_false",
    "VERDADERO FALSO": "true_false",
    "COMPLETAR": "fill_blank",
    "RELACIONAR": "matching",
    "RESPUESTA ABIERTA": "open",
}

TYPE_LABELS = {
    "multiple_choice": "opción múltiple",
    "true_false": "verdadero o falso",
    "fill_blank": "completar",
    "matching": "relacionar",
    "open": "respuesta abierta",
}

# Etiqueta normalizada -> campo. Una etiqueta coincide si es igual o empieza con la clave
# seguida de un espacio ("TIEMPO LIMITE MINUTOS" -> "TIEMPO LIMITE").
QUIZ_FIELDS = [
    ("TITULO", "title"),
    ("INSTRUCCIONES GENERALES", "instructions"),
    ("INSTRUCCIONES", "instructions"),
    ("CALIFICACION PARA APROBAR", "passingScore"),
    ("INTENTOS PERMITIDOS", "maxAttempts"),
    ("TIEMPO LIMITE", "timeLimitMinutes"),
]

SECTION_FIELDS = [
    ("NOMBRE DE LA SECCION", "name"),
    ("NOMBRE", "name"),
    ("INSTRUCCIONES", "instructions"),
    ("AUDIO O VIDEO", "media"),
    ("IMAGEN", "image"),
]

QUESTION_FIELDS = [
    ("PREGUNTA", "prompt"),
    ("AFIRMACION", "prompt"),
    ("ORACION", "prompt"),
    ("INSTRUCCION", "prompt"),
    ("IMAGEN", "image"),
    ("AUDIO O VIDEO", "media"),
    ("OPCIONES", "options"),
    ("RESPUESTA CORRECTA", "answer"),
    ("RESPUESTAS ACEPTADAS", "answers"),
    ("PARES", "pairs"),
    ("CRITERIOS DE EVALUACION", "criteria"),
    ("CRITERIOS", "criteria"),
    ("RESPUESTA MODELO", "modelAnswer"),
    ("PUNTOS", "points"),
    ("RETROALIMENTACION", "feedback"),
]

OPTION_PATTERN = re.compile(r"^\(?([A-Za-z])\s*[\)\.\-:]\s*(.+)$")
ANSWER_LETTER_PATTERN = re.compile(r"^\(?([a-z])\s*(?:[\)\.\-:]|$|\s)")
BLANK_PATTERN = re.compile(r"_{3,}")
NUMBER_PATTERN = re.compile(r"-?\d+(?:[.,]\d+)?")
YOUTUBE_PATTERN = re.compile(
    r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})",
    re.IGNORECASE,
)
SAFE_FILE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")

TRUE_WORDS = {"VERDADERO", "V", "TRUE", "T", "CIERTO"}
FALSE_WORDS = {"FALSO", "F", "FALSE"}


@dataclass
class Issue:
    level: str                    # "error" | "warning"
    message: str
    section: int | None = None
    question: int | None = None

    def as_dict(self) -> dict:
        return {"level": self.level, "message": self.message, "section": self.section, "question": self.question}


@dataclass
class QuizBuild:
    definition: dict
    report: dict
    images: dict[str, CardImage] = field(default_factory=dict)   # fileName -> imagen
    media: list[dict] = field(default_factory=list)              # filas para QUIZ_MEDIA

    @property
    def ok(self) -> bool:
        return self.report["errorCount"] == 0

    @property
    def required_files(self) -> list[str]:
        """Audios y videos citados en el Word que el académico debe subir."""
        return [m["fileName"] for m in self.media if m["mediaType"] in ("AUDIO", "VIDEO")]


def _number_text(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:g}"


def _parse_number(text: str) -> float | None:
    match = NUMBER_PATTERN.search(text or "")
    return float(match.group(0).replace(",", ".")) if match else None


class _Builder:
    def __init__(self):
        self.issues: list[Issue] = []
        self.images: dict[str, CardImage] = {}
        self.files: dict[str, dict] = {}     # nombre en minúsculas -> fila de QUIZ_MEDIA
        self.links: dict[str, dict] = {}

    # ── reporte ──

    def error(self, message, section=None, question=None):
        self.issues.append(Issue("error", message, section, question))

    def warning(self, message, section=None, question=None):
        self.issues.append(Issue("warning", message, section, question))

    # ── filas de una tarjeta ──

    def fields(self, card: Card, spec, where: str, section=None, question=None) -> dict[str, CardRow]:
        found: dict[str, CardRow] = {}
        for row in card.rows:
            if not row.key:
                continue
            name = next(
                (f for key, f in spec if row.key == key or row.key.startswith(key + " ")),
                None,
            )
            if name is None:
                self.warning(f"{where}: no se reconoce la fila «{row.label}»; se ignoró.", section, question)
            elif name in found:
                self.warning(f"{where}: la fila «{row.label}» aparece dos veces; se usa la primera.", section, question)
            else:
                found[name] = row
        return found

    @staticmethod
    def text(row: CardRow | None, separator=" ") -> str:
        return separator.join(row.lines).strip() if row else ""

    def media(self, row: CardRow | None, where, section=None, question=None) -> dict | None:
        if row is None or not row.lines:
            return None
        if len(row.lines) > 1:
            self.warning(f"{where}: en «Audio o video» solo se usa el primer renglón.", section, question)
        value = row.lines[0].strip().strip("\"'“”«»")

        if re.match(r"^https?://", value, re.IGNORECASE):
            match = YOUTUBE_PATTERN.search(value)
            if not match:
                self.error(f"{where}: solo se aceptan enlaces de YouTube (se escribió «{value}»).", section, question)
                return None
            video_id = match.group(1)
            self.links.setdefault(video_id, {
                "fileName": f"youtube-{video_id}", "mediaType": "LINK", "url": value,
                "contentType": None, "objectKey": None, "sha256": None, "sizeBytes": None, "isUploaded": "Y",
            })
            return {"kind": "youtube", "mediaType": "VIDEO", "url": value, "videoId": video_id}

        extension = value.rsplit(".", 1)[-1].lower() if "." in value else ""
        if not extension:
            self.error(f"{where}: escribe el nombre del archivo con su extensión, por ejemplo «dialogo.mp3» "
                       f"(se escribió «{value}»).", section, question)
            return None
        if extension in IMAGE_EXTENSIONS:
            self.error(f"{where}: «{value}» es una imagen; las imágenes se pegan en la fila «Imagen».", section, question)
            return None
        if extension in AUDIO_TYPES:
            media_type, content_type = "AUDIO", AUDIO_TYPES[extension]
        elif extension in VIDEO_TYPES:
            media_type, content_type = "VIDEO", VIDEO_TYPES[extension]
        else:
            self.error(f"{where}: el formato .{extension} no se acepta; usa MP3, M4A, WAV o MP4 "
                       f"(archivo «{value}»).", section, question)
            return None

        if not SAFE_FILE_NAME.match(value):
            self.warning(f"{where}: el nombre «{value}» tiene espacios, acentos o símbolos; al subir el archivo "
                         f"debe llamarse exactamente igual.", section, question)

        self.files.setdefault(value.lower(), {
            "fileName": value, "mediaType": media_type, "url": None, "contentType": content_type,
            "objectKey": None, "sha256": None, "sizeBytes": None, "isUploaded": "N",
        })
        return {"kind": "file", "mediaType": media_type, "fileName": self.files[value.lower()]["fileName"]}

    def image(self, row: CardRow | None, where, section=None, question=None) -> dict | None:
        # El texto de la fila Imagen es la pista de la plantilla: solo cuentan las imágenes
        if row is None or not row.images:
            return None
        if len(row.images) > 1:
            self.warning(f"{where}: hay {len(row.images)} imágenes en la fila «Imagen»; solo se usa la primera.",
                         section, question)
        image = row.images[0]
        if image.content_type not in BROWSER_IMAGE_TYPES:
            self.error(f"{where}: la imagen está en un formato que el navegador no muestra ({image.content_type}). "
                       f"Guárdala como PNG o JPG y vuelve a pegarla.", section, question)
            return None
        if len(image.data) > MAX_IMAGE_BYTES:
            self.warning(f"{where}: la imagen pesa {len(image.data) / 1024 / 1024:.1f} MB; se recomienda menos de "
                         f"2 MB para que cargue rápido.", section, question)
        file_name = f"imagen-{image.sha256[:12]}.{image.extension}"
        self.images[file_name] = image
        return {"fileName": file_name, "contentType": image.content_type}

    def points(self, row: CardRow | None, where, number) -> float:
        text = self.text(row)
        if not text:
            self.warning(f"{where}: no tiene puntos; se le asignará 1.", question=number)
            return 1.0
        value = _parse_number(text)
        if value is None or value <= 0:
            self.error(f"{where}: los puntos deben ser un número mayor que 0 (se escribió «{text}»).", question=number)
            return 0.0
        return value

    # ── tarjetas ──

    def quiz_card(self, card: Card) -> dict:
        where = "Datos del quiz"
        f = self.fields(card, QUIZ_FIELDS, where)

        title = self.text(f.get("title"))
        if not title:
            self.error(f"{where}: falta el título.")

        passing_text = self.text(f.get("passingScore"))
        passing = _parse_number(passing_text)
        if not passing_text:
            self.warning(f"{where}: no tiene calificación para aprobar; se usará {DEFAULT_PASSING_SCORE}.")
            passing = DEFAULT_PASSING_SCORE
        elif passing is None or not 0 <= passing <= 100:
            self.error(f"{where}: la calificación para aprobar debe ser un número de 0 a 100 "
                       f"(se escribió «{passing_text}»).")
            passing = None

        return {
            "title": title,
            "instructions": self.text(f.get("instructions"), "\n"),
            "passingScore": passing,
            "maxAttempts": self.positive_int(f.get("maxAttempts"), where, "los intentos permitidos"),
            "timeLimitMinutes": self.positive_int(f.get("timeLimitMinutes"), where, "el tiempo límite"),
        }

    def positive_int(self, row, where, label) -> int | None:
        text = self.text(row)
        if not text:
            return None
        value = _parse_number(text)
        if value is None or value < 1 or not float(value).is_integer():
            self.error(f"{where}: {label} debe ser un número entero mayor que 0, o quedar vacío "
                       f"(se escribió «{text}»).")
            return None
        return int(value)

    def section_card(self, card: Card, number: int) -> dict:
        f = self.fields(card, SECTION_FIELDS, f"Sección {number}", section=number)
        name = self.text(f.get("name"))
        where = f"Sección {number}" + (f" ({name})" if name else "")
        if not name:
            self.error(f"{where}: falta el nombre de la sección.", section=number)
        return {
            "key": f"S{number}",
            "number": number,
            "name": name,
            "instructions": self.text(f.get("instructions"), "\n"),
            "media": self.media(f.get("media"), where, section=number),
            "image": self.image(f.get("image"), where, section=number),
            "questions": [],
        }

    def question_card(self, card: Card, number: int, section: dict) -> dict | None:
        type_key = card.header_key[len("PREGUNTA"):].strip()
        qtype = QUESTION_TYPES.get(type_key)
        if qtype is None:
            self.error(f"Pregunta {number}: el tipo «{card.header}» no se reconoce. Usa una tarjeta en blanco de la "
                       f"guía: opción múltiple, verdadero o falso, completar, relacionar o respuesta abierta.",
                       question=number)
            return None

        where = f"Pregunta {number} ({TYPE_LABELS[qtype]})"
        f = self.fields(card, QUESTION_FIELDS, where, question=number)

        prompt = self.text(f.get("prompt"), "\n")
        if not prompt:
            self.error(f"{where}: falta el texto de la pregunta.", question=number)

        question = {
            "key": f"{section['key']}-P{len(section['questions']) + 1}",
            "number": number,
            "type": qtype,
            "prompt": prompt,
            "image": self.image(f.get("image"), where, question=number),
            "media": self.media(f.get("media"), where, question=number),
            "points": self.points(f.get("points"), where, number),
            "feedback": self.text(f.get("feedback"), "\n") or None,
        }
        getattr(self, f"_{qtype}")(question, f, where, number)
        return question

    def _multiple_choice(self, q, f, where, number):
        options, seen = [], set()
        rows = f.get("options").lines if f.get("options") else []
        for line in rows:
            match = OPTION_PATTERN.match(line)
            if not match:
                self.error(f"{where}: la opción «{line}» debe empezar con una letra y paréntesis, "
                           f"por ejemplo «a) In the morning».", question=number)
                continue
            key = match.group(1).lower()
            if key in seen:
                self.error(f"{where}: la letra «{key}» se repite en las opciones.", question=number)
                continue
            seen.add(key)
            options.append({"key": key, "text": match.group(2).strip()})
        if len(rows) < 2:
            self.error(f"{where}: necesita al menos 2 opciones, una por renglón.", question=number)

        answer_text = self.text(f.get("answer"))
        answer = None
        if not answer_text:
            self.error(f"{where}: falta la respuesta correcta (escribe solo la letra).", question=number)
        else:
            match = ANSWER_LETTER_PATTERN.match(answer_text.strip().lower())
            if not match:
                self.error(f"{where}: en «Respuesta correcta» escribe solo la letra, por ejemplo «a» "
                           f"(se escribió «{answer_text}»).", question=number)
            elif options and match.group(1) not in seen:
                letters = ", ".join(o["key"] for o in options)
                self.error(f"{where}: la respuesta «{match.group(1)}» no existe entre las opciones ({letters}).",
                           question=number)
            else:
                answer = match.group(1)
        q["options"] = options
        q["answer"] = answer

    def _true_false(self, q, f, where, number):
        text = self.text(f.get("answer"))
        word = normalize(text)
        if word in TRUE_WORDS:
            q["answer"] = True
        elif word in FALSE_WORDS:
            q["answer"] = False
        else:
            q["answer"] = None
            self.error(f"{where}: en «Respuesta correcta» escribe Verdadero o Falso"
                       + (f" (se escribió «{text}»)." if text else "."), question=number)

    def _fill_blank(self, q, f, where, number):
        blanks = len(BLANK_PATTERN.findall(q["prompt"]))
        if q["prompt"] and blanks == 0:
            self.error(f"{where}: marca el espacio que el estudiante debe completar con tres guiones bajos: ___",
                       question=number)
        elif blanks > 1:
            self.error(f"{where}: solo se permite un espacio ___ por pregunta (hay {blanks}). "
                       f"Divídela en varias preguntas.", question=number)
        q["prompt"] = BLANK_PATTERN.sub("___", q["prompt"])

        row = f.get("answers") or f.get("answer")
        answers = list(dict.fromkeys(row.lines)) if row else []
        if not answers:
            self.error(f"{where}: falta al menos una respuesta aceptada.", question=number)
        q["acceptedAnswers"] = answers

    def _matching(self, q, f, where, number):
        pairs, lefts, rights = [], set(), set()
        for line in (f.get("pairs").lines if f.get("pairs") else []):
            if "=" not in line:
                self.error(f"{where}: el par «{line}» no tiene el signo =. Escríbelo así: Good morning = Buenos días.",
                           question=number)
                continue
            left, right = (part.strip() for part in line.split("=", 1))
            if not left or not right:
                self.error(f"{where}: al par «{line}» le falta un lado del signo =.", question=number)
                continue
            if left.lower() in lefts or right.lower() in rights:
                self.error(f"{where}: el par «{line}» repite un elemento de otro par; cada lado debe ser único.",
                           question=number)
                continue
            lefts.add(left.lower())
            rights.add(right.lower())
            pairs.append({"left": left, "right": right})
        if len(pairs) < 2 and not any(i.question == number and i.level == "error" for i in self.issues):
            self.error(f"{where}: necesita al menos 2 pares, uno por renglón.", question=number)
        q["pairs"] = pairs

    def _open(self, q, f, where, number):
        criteria = f.get("criteria").lines if f.get("criteria") else []
        if not criteria:
            self.error(f"{where}: escribe al menos un criterio de evaluación; la IA califica con ellos.",
                       question=number)
        q["criteria"] = criteria
        q["modelAnswer"] = self.text(f.get("modelAnswer"), "\n") or None

    # ── documento ──

    def build(self, cards: list[Card]) -> QuizBuild:
        quiz = None
        sections: list[dict] = []
        number = 0

        for card in cards:
            header = card.header_key
            if header.startswith("DATOS DEL QUIZ"):
                if quiz is not None:
                    self.error("Hay más de una tarjeta DATOS DEL QUIZ; deja solo una, al inicio.")
                    continue
                quiz = self.quiz_card(card)
            elif header.startswith("SECCION"):
                sections.append(self.section_card(card, len(sections) + 1))
            elif header.startswith("PREGUNTA"):
                number += 1
                if not sections:
                    self.error(f"Pregunta {number}: está antes de cualquier tarjeta SECCIÓN; "
                               f"agrega una sección arriba de ella.", question=number)
                    continue
                question = self.question_card(card, number, sections[-1])
                if question:
                    sections[-1]["questions"].append(question)
            else:
                label = card.header[:40] or "vacío"
                self.warning(f"Se ignoró la tabla {card.number}: no es una tarjeta del quiz "
                             f"(su encabezado es «{label}»).")

        if quiz is None:
            self.error("Falta la tarjeta DATOS DEL QUIZ al inicio del documento.")
            quiz = {"title": "", "instructions": "", "passingScore": None, "maxAttempts": None, "timeLimitMinutes": None}

        for section in sections:
            if not section["questions"]:
                self.warning(f"Sección {section['number']} ({section['name'] or 'sin nombre'}): no tiene preguntas.",
                             section=section["number"])

        questions = [q for s in sections for q in s["questions"]]
        if not sections:
            self.error("El quiz no tiene secciones: agrega al menos una tarjeta SECCIÓN.")
        elif not questions:
            self.error("El quiz no tiene preguntas: agrega tarjetas PREGUNTA debajo de las secciones.")

        total_points = sum(q["points"] for q in questions)
        definition = {
            "schemaVersion": SCHEMA_VERSION,
            **quiz,
            "totalPoints": total_points,
            "questionCount": len(questions),
            "sections": sections,
        }

        media = [
            {"fileName": name, "mediaType": "IMAGE", "url": None, "contentType": image.content_type,
             "objectKey": None, "sha256": image.sha256, "sizeBytes": len(image.data), "isUploaded": "N"}
            for name, image in self.images.items()
        ] + list(self.files.values()) + list(self.links.values())

        return QuizBuild(
            definition=definition,
            report=self.report(len(sections), len(questions), total_points),
            images=dict(self.images),
            media=media,
        )

    def report(self, sections: int, questions: int, points: float) -> dict:
        errors = sum(1 for i in self.issues if i.level == "error")
        return {
            "errorCount": errors,
            "warningCount": len(self.issues) - errors,
            "summary": (f"Se detectaron {sections} {'sección' if sections == 1 else 'secciones'} y "
                        f"{questions} {'pregunta' if questions == 1 else 'preguntas'} "
                        f"({_number_text(points)} {'punto' if points == 1 else 'puntos'} en total)."),
            "items": [i.as_dict() for i in self.issues],
        }


def build_quiz(cards: list[Card]) -> QuizBuild:
    return _Builder().build(cards)


def analyze_docx(data: bytes) -> QuizBuild:
    """Lee y valida el Word de un quiz. Nunca lanza excepción: los problemas van en el reporte."""
    try:
        cards = read_cards(data)
    except QuizDocumentError as error:
        return QuizBuild(
            definition={},
            report={"errorCount": 1, "warningCount": 0, "summary": "No se pudo leer el documento.",
                    "items": [Issue("error", str(error)).as_dict()]},
        )
    return build_quiz(cards)
