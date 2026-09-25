const ORACLE_BASE =
  "https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api";

export async function getMissionContent(missionId) {
  try {
    const res = await fetch(`${ORACLE_BASE}/missions/content/${missionId}`);
    if (!res.ok) return null;

    const data = await res.json();
    // Collection Query devuelve { items: [...] }
    const raw = data.items?.[0];

    // Sin row o con todas las columnas null → misión sin contenido aún
    if (!raw) return null;
    const hasContent =
      raw.objectives_json || raw.vocabulary_json ||
      raw.grammar_json    || raw.examples_json;
    if (!hasContent) return null;

    return {
      missionId: raw.mission_id,
      objectives: raw.objectives_json ? JSON.parse(raw.objectives_json) : [],
      vocabulary: raw.vocabulary_json ? JSON.parse(raw.vocabulary_json) : [],
      grammar: raw.grammar_json ? JSON.parse(raw.grammar_json) : null,
      examples: raw.examples_json ? JSON.parse(raw.examples_json) : [],
      contentVersion: raw.content_version ?? 0,
    };
  } catch {
    return null;
  }
}

export async function saveMissionContent(missionId, content) {
  const res = await fetch(`${ORACLE_BASE}/missions/content/${missionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectives: content.objectives,
      vocabulary: content.vocabulary,
      grammar: content.grammar,
      examples: content.examples,
    }),
  });

  if (!res.ok) {
    throw new Error(`Save failed: ${res.status}`);
  }

  return res.json();
}

export async function getAdminMissionList() {
  try {
    const res = await fetch(`${ORACLE_BASE}/missions/admin/list`);
    if (!res.ok) return [];

    const data = await res.json();

    // ORDS devuelve claves en minúsculas — normalizamos a camelCase
    return (data.items ?? []).map((m) => ({
      missionId: m.missionid,
      title: m.title,
      topicTitle: m.topictitle,
      topicId: m.topicid,
      sortOrder: m.sortorder,
      hasContent: m.hascontent,
      contentVersion: m.contentversion,
    }));
  } catch {
    return [];
  }
}
