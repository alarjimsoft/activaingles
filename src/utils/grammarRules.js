// Formato de grammar_json en Oracle: { ...primeraRegla, rules: [todas las reglas] }.
// Los campos de la primera regla se repiten arriba para que lo que todavía lee
// grammar.title / grammar.rule (versiones anteriores del frontend y del backend)
// siga funcionando. Las misiones guardadas antes (un solo objeto, sin "rules")
// se leen como una lista de una regla.

export const EMPTY_GRAMMAR_RULE = {
  title: "",
  rule: "",
  explanation: "",
  dos: [""],
  donts: [""],
  note: "",
};

function hasText(rule) {
  return Boolean(rule?.title?.trim() || rule?.rule?.trim() || rule?.explanation?.trim());
}

// Todas las reglas guardadas, incluidas las vacías (para el editor)
export function readGrammarRules(grammar) {
  if (!grammar) return [];
  if (Array.isArray(grammar)) return grammar;
  if (Array.isArray(grammar.rules)) return grammar.rules;
  return [grammar];
}

// Solo las reglas con contenido (para el estudiante, el tutor y los ejercicios)
export function getGrammarRules(grammar) {
  return readGrammarRules(grammar).filter(hasText);
}

// Gramática para el tutor y los ejercicios (backend): solo reglas con contenido
export function grammarForAI(rules = []) {
  return rules.length > 0 ? { ...rules[0], rules } : null;
}

// Lo que se guarda en Oracle a partir de la lista del editor
export function buildGrammar(rules) {
  const list = rules.length > 0 ? rules : [{ ...EMPTY_GRAMMAR_RULE }];
  return { ...list[0], rules: list };
}
