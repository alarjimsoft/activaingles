// Ejercicio "¿Cómo se dice en inglés?": preguntas a partir del vocabulario de la misión
// (definition en español → term en inglés) y revisión de lo que dijo el estudiante.

export const QUESTION_COUNT = 6;

// Cuando la misma frase en español aparece en dos categorías ("Buenas noches" →
// good evening / good night) se aclara en la pregunta cuál se espera.
const CATEGORY_CONTEXT = {
  saludos: "para saludar al llegar a un lugar",
  despedidas: "para despedirte al irte",
};

// Para misiones sin vocabulario cargado en Oracle
const FALLBACK_VOCABULARY = [
  { term: "Good morning", definition: "Buenos días", category: "Saludos" },
  { term: "Good afternoon", definition: "Buenas tardes", category: "Saludos" },
  { term: "Good evening", definition: "Buenas noches", category: "Saludos" },
  { term: "Hello", definition: "Hola", category: "Saludos" },
  { term: "How are you?", definition: "¿Cómo estás?", category: "Saludos" },
  { term: "Good night", definition: "Buenas noches", category: "Despedidas" },
  { term: "Good bye", definition: "Adiós", category: "Despedidas" },
  { term: "See you later", definition: "Te veo más tarde", category: "Despedidas" },
];

const CONTRACTIONS = [
  [/\bi'm\b/g, "i am"],
  [/\bit's\b/g, "it is"],
  [/\byou're\b/g, "you are"],
  [/\bhow's\b/g, "how is"],
  [/\bwhat's\b/g, "what is"],
  [/\bthat's\b/g, "that is"],
  [/\blet's\b/g, "let us"],
];

export function normalize(text) {
  let s = (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'");
  for (const [pattern, full] of CONTRACTIONS) s = s.replace(pattern, full);
  return s
    .replace(/goodbye/g, "good bye")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// "Hi/Hello/Hallo" → 3 respuestas. Las partes en minúscula completan la primera:
// "See you later/tomorrow/soon" → see you later, see you tomorrow, see you soon
function splitVariants(text) {
  const [first, ...rest] = text.split("/").map((p) => p.trim()).filter(Boolean);
  if (!first) return [];
  const firstWords = first.split(/\s+/);
  return [
    first,
    ...rest.map((part) => {
      const words = part.split(/\s+/);
      if (/^[a-z]/.test(part) && words.length < firstWords.length) {
        return [...firstWords.slice(0, firstWords.length - words.length), ...words].join(" ");
      }
      return part;
    }),
  ];
}

// Lo que va entre paréntesis es opcional: "Nice to meet you (too)"
function answerVariants(term) {
  const withOptional = term.replace(/[()]/g, "");
  const withoutOptional = term.replace(/\([^)]*\)/g, "").replace(/[()]/g, "");
  return [withoutOptional, withOptional].flatMap(splitVariants).map(normalize).filter(Boolean);
}

function modelAnswer(term) {
  return splitVariants(term.replace(/\([^)]*\)/g, "").replace(/[()]/g, ""))[0] ?? term;
}

export function buildQuestions(vocabulary, count = QUESTION_COUNT) {
  const source = (vocabulary ?? []).filter((v) => v.term?.trim() && v.definition?.trim());
  const items = source.length > 0 ? source : FALLBACK_VOCABULARY;

  // Misma frase en español y misma categoría ("¿Cómo estás?"): una pregunta que acepta ambas
  const groups = new Map();
  for (const v of items) {
    const spanish = v.definition.split("/")[0].trim();
    const category = (v.category ?? "").trim();
    const key = `${spanish.toLowerCase()}|${category.toLowerCase()}`;
    const group = groups.get(key) ?? { spanish, category, terms: [], hasVariants: false };
    group.terms.push(v.term.trim());
    group.hasVariants ||= v.definition.includes("/");
    groups.set(key, group);
  }

  const spanishUses = {};
  for (const g of groups.values()) {
    const key = g.spanish.toLowerCase();
    spanishUses[key] = (spanishUses[key] ?? 0) + 1;
  }

  const questions = [...groups.values()].map((g) => {
    const ambiguous = spanishUses[g.spanish.toLowerCase()] > 1 && g.category;
    return {
      spanish: g.spanish,
      context: ambiguous
        ? CATEGORY_CONTEXT[g.category.toLowerCase()] ?? `(${g.category.toLowerCase()})`
        : null,
      answer: modelAnswer(g.terms[0]),
      accepted: [...new Set(g.terms.flatMap(answerVariants))],
      // "Te veo más tarde/mañana/pronto": se pregunta solo la primera parte; mejor evitarlas
      preferred: !g.hasVariants,
    };
  });

  const chosen = [
    ...shuffle(questions.filter((q) => q.preferred)),
    ...shuffle(questions.filter((q) => !q.preferred)),
  ].slice(0, count);

  return shuffle(chosen);
}

// Lo que dice el avatar al preguntar
export function questionText(question) {
  const spanish = question.spanish.replace(/[¿?¡!]/g, "").trim();
  return `¿Cómo dices «${spanish}» en inglés${question.context ? `, ${question.context}` : ""}?`;
}

// Correcto si alguna respuesta aceptada aparece completa en lo que se escuchó
// ("Good morning, teacher" cuenta para "good morning")
export function isCorrectAnswer(transcript, accepted) {
  const heard = ` ${normalize(transcript)} `;
  return accepted.some((answer) => heard.includes(` ${answer} `));
}

// "Saludos" y "Despedidas" → "saludos y despedidas"
export function practiceTopic(vocabulary) {
  const categories = [
    ...new Set((vocabulary ?? []).map((v) => v.category?.trim().toLowerCase()).filter(Boolean)),
  ];
  if (categories.length === 0) return "frases de esta misión";
  if (categories.length === 1) return categories[0];
  return `${categories.slice(0, -1).join(", ")} y ${categories[categories.length - 1]}`;
}
