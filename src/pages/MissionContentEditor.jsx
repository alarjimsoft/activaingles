import { useState, useEffect, useCallback } from "react";

import { motion, AnimatePresence } from "framer-motion";

import {
  BookOpen,
  Plus,
  Trash2,
  Save,
  CheckCircle,
  AlertCircle,
  Loader2,
  Target,
  Volume2,
  AlignLeft,
  MessageSquare,
} from "lucide-react";

import Sidebar from "../components/layout/Sidebar";

import {
  getAdminMissionList,
  getMissionContent,
  saveMissionContent,
} from "../services/missionContentService";

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
const EMPTY_OBJECTIVE = "";

const EMPTY_VOCAB = {
  term: "",
  definition: "",
  example: "",
  part_of_speech: "",
  category: "",
};

// Categorías ya usadas en la misión, sin repetir (ignora mayúsculas/minúsculas)
function vocabularyCategories(vocabulary) {
  const seen = new Map();
  vocabulary.forEach((v) => {
    const name = v.category?.trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name, count: 0 });
    seen.get(key).count += 1;
  });
  return [...seen.values()];
}

const EMPTY_GRAMMAR = {
  title: "",
  rule: "",
  explanation: "",
  dos: [""],
  donts: [""],
  note: "",
};

const EMPTY_EXAMPLE = { phrase: "", context: "", response: "" };

function emptyContent() {
  return {
    objectives: [""],
    vocabulary: [{ ...EMPTY_VOCAB }],
    grammar: { ...EMPTY_GRAMMAR, dos: [""], donts: [""] },
    examples: [{ ...EMPTY_EXAMPLE }],
  };
}

/* ─────────────────────────────────────────
   Sub-editors
───────────────────────────────────────── */
function ObjectivesEditor({ objectives, onChange }) {
  function update(i, val) {
    const next = [...objectives];
    next[i] = val;
    onChange(next);
  }

  function add() {
    onChange([...objectives, ""]);
  }

  function remove(i) {
    onChange(objectives.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      <p className="text-zinc-400 text-sm">
        Define qué va a aprender el estudiante en esta misión (3-5 objetivos
        recomendados).
      </p>

      {objectives.map((obj, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="text-cyan-500 font-bold text-sm mt-3 w-5 shrink-0">
            {i + 1}
          </span>
          <input
            type="text"
            value={obj}
            onChange={(e) => update(i, e.target.value)}
            placeholder="Ej: Use present continuous to describe ongoing actions"
            className="flex-1 bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          {objectives.length > 1 && (
            <button
              onClick={() => remove(i)}
              className="mt-2 text-zinc-600 hover:text-red-400 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}

      <button
        onClick={add}
        className="flex items-center gap-2 text-cyan-500 hover:text-cyan-400 text-sm font-medium transition-colors"
      >
        <Plus size={16} />
        Agregar objetivo
      </button>
    </div>
  );
}

function VocabularyEditor({ vocabulary, onChange }) {
  function update(i, field, val) {
    const next = vocabulary.map((v, idx) =>
      idx === i ? { ...v, [field]: val } : v,
    );
    onChange(next);
  }

  // La palabra nueva hereda la categoría de la anterior para capturar grupos más rápido
  function add() {
    const lastCategory = vocabulary[vocabulary.length - 1]?.category ?? "";
    onChange([...vocabulary, { ...EMPTY_VOCAB, category: lastCategory }]);
  }

  function remove(i) {
    onChange(vocabulary.filter((_, idx) => idx !== i));
  }

  const categories = vocabularyCategories(vocabulary);

  return (
    <div className="space-y-4">
      <p className="text-zinc-400 text-sm">
        Vocabulario clave de la misión. Los ejemplos deben estar en inglés; las
        definiciones pueden ser en español. Usa la categoría para agrupar
        palabras (por ejemplo: Profesiones, Frutas); el estudiante las verá por
        grupo.
      </p>

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-500 text-xs">Categorías en esta misión:</span>
          {categories.map((c) => (
            <span
              key={c.name}
              className="text-xs bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 px-2.5 py-1 rounded-full"
            >
              {c.name} <span className="text-zinc-500">{c.count}</span>
            </span>
          ))}
        </div>
      )}

      <datalist id="vocabulary-categories">
        {categories.map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>

      {vocabulary.map((v, i) => (
        <div
          key={i}
          className="bg-zinc-800/50 border border-zinc-700 rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-cyan-400 text-xs font-semibold uppercase tracking-wider">
              Palabra {i + 1}
            </span>
            {vocabulary.length > 1 && (
              <button
                onClick={() => remove(i)}
                className="text-zinc-600 hover:text-red-400 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={v.term}
              onChange={(e) => update(i, "term", e.target.value)}
              placeholder="Term (en inglés)"
              className="bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <input
              type="text"
              value={v.part_of_speech}
              onChange={(e) => update(i, "part_of_speech", e.target.value)}
              placeholder="Tipo (noun, verb, adverb…)"
              className="bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <input
            type="text"
            list="vocabulary-categories"
            value={v.category ?? ""}
            onChange={(e) => update(i, "category", e.target.value)}
            placeholder="Categoría (elige una o escribe una nueva, ej: Profesiones)"
            className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />

          <input
            type="text"
            value={v.definition}
            onChange={(e) => update(i, "definition", e.target.value)}
            placeholder="Definición (puede ser en español)"
            className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />

          <input
            type="text"
            value={v.example}
            onChange={(e) => update(i, "example", e.target.value)}
            placeholder="Ejemplo de uso en inglés"
            className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      ))}

      <button
        onClick={add}
        className="flex items-center gap-2 text-cyan-500 hover:text-cyan-400 text-sm font-medium transition-colors"
      >
        <Plus size={16} />
        Agregar palabra
      </button>
    </div>
  );
}

function StringListEditor({ items, onChange, placeholder, label }) {
  function update(i, val) {
    const next = [...items];
    next[i] = val;
    onChange(next);
  }

  function add() {
    onChange([...items, ""]);
  }

  function remove(i) {
    if (items.length <= 1) return;
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
          {label}
        </p>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-zinc-800 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <button
            onClick={() => remove(i)}
            disabled={items.length <= 1}
            className="text-zinc-600 hover:text-red-400 disabled:opacity-30 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1.5 text-cyan-500/80 hover:text-cyan-400 text-xs font-medium transition-colors"
      >
        <Plus size={13} />
        Agregar
      </button>
    </div>
  );
}

function GrammarEditor({ grammar, onChange }) {
  function update(field, val) {
    onChange({ ...grammar, [field]: val });
  }

  return (
    <div className="space-y-4">
      <p className="text-zinc-400 text-sm">
        Una sola regla gramatical por misión. La regla en inglés; la explicación
        puede ir en español con ejemplos en inglés.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-zinc-400 text-xs mb-1 block">
            Título de la regla
          </label>
          <input
            type="text"
            value={grammar.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Ej: Present Continuous"
            className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <div>
          <label className="text-zinc-400 text-xs mb-1 block">
            Fórmula / estructura
          </label>
          <input
            type="text"
            value={grammar.rule}
            onChange={(e) => update("rule", e.target.value)}
            placeholder="Ej: Subject + am/is/are + verb-ing"
            className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div>
        <label className="text-zinc-400 text-xs mb-1 block">Explicación</label>
        <textarea
          value={grammar.explanation}
          onChange={(e) => update("explanation", e.target.value)}
          placeholder="Explica cuándo y cómo se usa esta regla. Puede ser en español."
          rows={3}
          className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StringListEditor
          items={grammar.dos}
          onChange={(val) => update("dos", val)}
          placeholder="Ejemplo correcto en inglés"
          label="✓ Sí se dice"
        />
        <StringListEditor
          items={grammar.donts}
          onChange={(val) => update("donts", val)}
          placeholder="Ejemplo incorrecto en inglés"
          label="✗ No se dice"
        />
      </div>

      <div>
        <label className="text-zinc-400 text-xs mb-1 block">
          Nota adicional (opcional)
        </label>
        <input
          type="text"
          value={grammar.note}
          onChange={(e) => update("note", e.target.value)}
          placeholder="Ej: Stative verbs cannot take the continuous form."
          className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      </div>
    </div>
  );
}

function ExamplesEditor({ examples, onChange }) {
  function update(i, field, val) {
    const next = examples.map((ex, idx) =>
      idx === i ? { ...ex, [field]: val } : ex,
    );
    onChange(next);
  }

  function add() {
    onChange([...examples, { ...EMPTY_EXAMPLE }]);
  }

  function remove(i) {
    onChange(examples.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      <p className="text-zinc-400 text-sm">
        Frases de ejemplo en contexto real. Todos los campos en inglés (3-5
        ejemplos recomendados).
      </p>

      {examples.map((ex, i) => (
        <div
          key={i}
          className="bg-zinc-800/50 border border-zinc-700 rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-cyan-400 text-xs font-semibold uppercase tracking-wider">
              Ejemplo {i + 1}
            </span>
            {examples.length > 1 && (
              <button
                onClick={() => remove(i)}
                className="text-zinc-600 hover:text-red-400 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>

          <input
            type="text"
            value={ex.phrase}
            onChange={(e) => update(i, "phrase", e.target.value)}
            placeholder="Frase en inglés"
            className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />

          <input
            type="text"
            value={ex.context}
            onChange={(e) => update(i, "context", e.target.value)}
            placeholder="Contexto situacional (opcional)"
            className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />

          <input
            type="text"
            value={ex.response}
            onChange={(e) => update(i, "response", e.target.value)}
            placeholder="Respuesta natural / continuación (opcional)"
            className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      ))}

      <button
        onClick={add}
        className="flex items-center gap-2 text-cyan-500 hover:text-cyan-400 text-sm font-medium transition-colors"
      >
        <Plus size={16} />
        Agregar ejemplo
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────
   Tabs config
───────────────────────────────────────── */
const TABS = [
  { id: "objectives", label: "Objetivos", icon: Target },
  { id: "vocabulary", label: "Vocabulario", icon: Volume2 },
  { id: "grammar", label: "Gramática", icon: AlignLeft },
  { id: "examples", label: "Ejemplos", icon: MessageSquare },
];

/* ─────────────────────────────────────────
   Main Page
───────────────────────────────────────── */
export default function MissionContentEditor() {
  const [missions, setMissions] = useState([]);
  const [loadingMissions, setLoadingMissions] = useState(true);
  const [selectedMission, setSelectedMission] = useState(null);
  const [content, setContent] = useState(emptyContent());
  const [loadingContent, setLoadingContent] = useState(false);
  const [activeTab, setActiveTab] = useState("objectives");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const [missionDropdownOpen, setMissionDropdownOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const list = await getAdminMissionList();
      setMissions(list);
      setLoadingMissions(false);
    }
    load();
  }, []);

  const loadMissionContent = useCallback(async (mission) => {
    setSelectedMission(mission);
    setLoadingContent(true);
    setSaveStatus(null);
    setActiveTab("objectives");

    const data = await getMissionContent(mission.missionId);
    if (data) {
      setContent({
        objectives:
          data.objectives.length > 0 ? data.objectives : [""],
        vocabulary:
          data.vocabulary.length > 0 ? data.vocabulary : [{ ...EMPTY_VOCAB }],
        grammar: data.grammar ?? { ...EMPTY_GRAMMAR, dos: [""], donts: [""] },
        examples:
          data.examples.length > 0 ? data.examples : [{ ...EMPTY_EXAMPLE }],
      });
    } else {
      setContent(emptyContent());
    }

    setLoadingContent(false);
  }, []);

  async function handleSave() {
    if (!selectedMission) return;

    setSaving(true);
    setSaveStatus(null);

    try {
      await saveMissionContent(selectedMission.missionId, content);
      setSaveStatus("success");

      // Actualiza el badge hasContent en la lista local
      setMissions((prev) =>
        prev.map((m) =>
          m.missionId === selectedMission.missionId
            ? { ...m, hasContent: true }
            : m,
        ),
      );
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }

  const groupedMissions = missions.reduce((acc, m) => {
    const topic = m.topicTitle ?? "Sin topic";
    if (!acc[topic]) acc[topic] = [];
    acc[topic].push(m);
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Mission Selector Panel ── */}
        <aside className="w-72 min-h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col">
          <div className="p-5 border-b border-zinc-800">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <BookOpen size={18} className="text-cyan-500" />
              Misiones
            </h2>
            <p className="text-zinc-500 text-xs mt-1">
              {missions.length} misiones disponibles
            </p>
          </div>

          <div className="flex-1 overflow-y-auto py-3">
            {loadingMissions ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={22} className="text-cyan-500 animate-spin" />
              </div>
            ) : missions.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-zinc-500 text-sm">
                  El endpoint{" "}
                  <code className="text-zinc-400">/missions/admin/list</code> no
                  está disponible aún.
                </p>
                <p className="text-zinc-600 text-xs mt-2">
                  Ingresa el ID de misión manualmente.
                </p>
              </div>
            ) : (
              Object.entries(groupedMissions).map(([topic, mlist]) => (
                <div key={topic} className="mb-2">
                  <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider px-5 py-2">
                    {topic}
                  </p>
                  {mlist.map((m) => {
                    const isSelected =
                      selectedMission?.missionId === m.missionId;
                    return (
                      <button
                        key={m.missionId}
                        onClick={() => loadMissionContent(m)}
                        className={`w-full text-left px-5 py-3 flex items-center justify-between gap-3 transition-colors ${
                          isSelected
                            ? "bg-cyan-500/10 border-l-2 border-cyan-500"
                            : "hover:bg-zinc-800/50"
                        }`}
                      >
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-medium truncate ${
                              isSelected ? "text-cyan-400" : "text-zinc-300"
                            }`}
                          >
                            {m.title}
                          </p>
                          <p className="text-zinc-600 text-xs">
                            ID: {m.missionId}
                          </p>
                        </div>
                        {m.hasContent ? (
                          <CheckCircle
                            size={14}
                            className="text-green-500 shrink-0"
                          />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-zinc-700 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}

            {/* Manual ID fallback */}
            {missions.length === 0 && (
              <ManualMissionLoader onLoad={loadMissionContent} />
            )}
          </div>
        </aside>

        {/* ── Content Editor Panel ── */}
        <main className="flex-1 overflow-y-auto">
          {!selectedMission ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <BookOpen size={48} className="text-zinc-700 mb-4" />
              <h3 className="text-white text-xl font-semibold mb-2">
                Selecciona una misión
              </h3>
              <p className="text-zinc-500 text-sm max-w-sm">
                Elige una misión del panel izquierdo para editar su contenido
                pedagógico.
              </p>
            </div>
          ) : loadingContent ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={28} className="text-cyan-500 animate-spin" />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto p-8">
              {/* Header */}
              <div className="flex items-start justify-between mb-8">
                <div>
                  <h1 className="text-white text-2xl font-bold">
                    {selectedMission.title}
                  </h1>
                  <p className="text-zinc-500 text-sm mt-1">
                    ID {selectedMission.missionId} · {selectedMission.topicTitle}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <AnimatePresence mode="wait">
                    {saveStatus === "success" && (
                      <motion.span
                        key="ok"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-1.5 text-green-400 text-sm"
                      >
                        <CheckCircle size={15} />
                        Guardado
                      </motion.span>
                    )}
                    {saveStatus === "error" && (
                      <motion.span
                        key="err"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-1.5 text-red-400 text-sm"
                      >
                        <AlertCircle size={15} />
                        Error al guardar
                      </motion.span>
                    )}
                  </AnimatePresence>

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-black font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-zinc-800/50 p-1 rounded-2xl mb-6">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        activeTab === tab.id
                          ? "bg-zinc-900 text-white shadow"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <Icon size={15} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  {activeTab === "objectives" && (
                    <ObjectivesEditor
                      objectives={content.objectives}
                      onChange={(v) =>
                        setContent((c) => ({ ...c, objectives: v }))
                      }
                    />
                  )}
                  {activeTab === "vocabulary" && (
                    <VocabularyEditor
                      vocabulary={content.vocabulary}
                      onChange={(v) =>
                        setContent((c) => ({ ...c, vocabulary: v }))
                      }
                    />
                  )}
                  {activeTab === "grammar" && (
                    <GrammarEditor
                      grammar={content.grammar}
                      onChange={(v) =>
                        setContent((c) => ({ ...c, grammar: v }))
                      }
                    />
                  )}
                  {activeTab === "examples" && (
                    <ExamplesEditor
                      examples={content.examples}
                      onChange={(v) =>
                        setContent((c) => ({ ...c, examples: v }))
                      }
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Manual mission loader (fallback cuando el
   endpoint /missions/admin/list no existe)
───────────────────────────────────────── */
function ManualMissionLoader({ onLoad }) {
  const [missionId, setMissionId] = useState("");

  function handleLoad() {
    const id = parseInt(missionId, 10);
    if (!id) return;
    onLoad({ missionId: id, title: `Misión ${id}`, topicTitle: "—" });
  }

  return (
    <div className="px-5 py-4 border-t border-zinc-800 mt-4">
      <p className="text-zinc-500 text-xs mb-2">Cargar por ID</p>
      <div className="flex gap-2">
        <input
          type="number"
          value={missionId}
          onChange={(e) => setMissionId(e.target.value)}
          placeholder="ID misión"
          className="flex-1 bg-zinc-800 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          onKeyDown={(e) => e.key === "Enter" && handleLoad()}
        />
        <button
          onClick={handleLoad}
          className="bg-cyan-500 text-black font-semibold px-3 py-2 rounded-xl text-sm hover:bg-cyan-400 transition-colors"
        >
          Ir
        </button>
      </div>
    </div>
  );
}
