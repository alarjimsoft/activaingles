// Utilidades de presentación de los quizzes (vista previa del académico y quiz del estudiante)

export function isAnswered(question, value) {
  if (value === undefined || value === null) return false;
  if (question.type === "matching") return question.left.every((left) => value[left]);
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function pointsLabel(points) {
  const value = Number(points) || 0;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${value === 1 ? "punto" : "puntos"}`;
}

const boolLabel = (value) => (value === true ? "Verdadero" : value === false ? "Falso" : "");

// Respuesta del estudiante como texto (para el resultado de cada pregunta)
export function studentAnswerText(result) {
  const answer = result.studentAnswer;
  switch (result.type) {
    case "multiple_choice": {
      const option = result.options?.find((o) => o.key === answer);
      return option ? `${option.key}) ${option.text}` : "";
    }
    case "true_false":
      return boolLabel(answer);
    case "matching":
      return (result.left ?? [])
        .map((left) => `${left} = ${answer?.[left] || "—"}`)
        .join("\n");
    default:
      return answer || "";
  }
}

// Respuesta correcta como texto (solo llega si el backend permite mostrarla)
export function correctAnswerText(result) {
  const correct = result.correctAnswer;
  if (correct === undefined || correct === null) return "";
  switch (result.type) {
    case "multiple_choice":
      return `${correct.key}) ${correct.text}`;
    case "true_false":
      return boolLabel(correct);
    case "fill_blank":
      return correct.join(" / ");
    case "matching":
      return correct.map((pair) => `${pair.left} = ${pair.right}`).join("\n");
    default:
      return correct;
  }
}

export function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}
