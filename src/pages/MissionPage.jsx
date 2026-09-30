import { useParams, useLocation } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";

import MainLayout from "../layouts/MainLayout";
import MissionSidebar from "../components/mission/MissionSidebar";
import TutorChat from "../components/mission/TutorChat";
import Loader from "../components/ui/Loader";

import useAuthStore from "../store/authStore";
import { getMissions } from "../services/missionService";
import { getMissionContent } from "../services/missionContentService";
import { startProgress, getPhaseStatus, updatePhase } from "../services/progressService";
import MissionPhaseNavigator from "../components/mission/MissionPhaseNavigator";
import LearningGuide from "../components/mission/LearningGuide";
import PracticeZone from "../components/mission/PracticeZone";
import PronunciationAssessment from "../components/mission/PronunciationAssessment";
import SpellingAssessment from "../components/mission/SpellingAssessment";
import CompletionScreen from "../components/mission/CompletionScreen";
import {
  DEFAULT_PHASES,
  getMissionPhases,
  getAssessmentType,
  getPhaseWeights,
  resolvePhase,
} from "../config/missionPhases";

export default function MissionPage() {
  const { id } = useParams();
  const location = useLocation();
  const inscripcion = useAuthStore((state) => state.inscripcion);
  const student     = useAuthStore((state) => state.student);

  const [mission, setMission] = useState(location.state?.mission ?? null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  const [currentPhase, setCurrentPhase] = useState(null);
  const [missionContent, setMissionContent] = useState(null);
  const [practiceScore, setPracticeScore] = useState(null);

  useEffect(() => {
    if (!inscripcion) return;

    async function initialize() {
      try {
        // 1. Resolve mission object (from nav state or Oracle fallback)
        let resolvedMission = mission;
        if (!resolvedMission) {
          const missions = await getMissions(
            inscripcion.idCurso,
            inscripcion.idInscripcion,
          );
          resolvedMission = missions.find((m) => String(m.id) === String(id)) ?? null;
          if (resolvedMission) setMission(resolvedMission);
        }

        if (!resolvedMission) return;

        // 2. Crear registro USER_PROGRESS si no existe (idempotente)
        await startProgress({
          idInscripcion: inscripcion.idInscripcion,
          missionId: resolvedMission.id,
        }).catch(() => {});

        // 3. Load content and phase status in parallel
        const [content, phaseStatus] = await Promise.all([
          getMissionContent(resolvedMission.id),
          getPhaseStatus(inscripcion.idInscripcion, resolvedMission.id),
        ]);

        setMissionContent(content);

        // Restaurar practice score guardado en Oracle al retomar misión
        if (phaseStatus?.practice_score) {
          setPracticeScore(phaseStatus.practice_score);
        }

        // 3. Determine starting phase — siempre desde learning
        // Misiones iniciadas con el orden anterior (conversación antes que pronunciación):
        // si está en conversación sin haber hecho pronunciación, se lleva a pronunciación.
        let startPhase = "learning";
        if (
          phaseStatus?.current_phase === "conversation" &&
          phaseStatus?.assessment_completed === "N"
        ) {
          startPhase = "assessment";
        } else if (phaseStatus?.current_phase) {
          startPhase = phaseStatus.current_phase;
        }
        // Si la misión no tiene esa fase (p. ej. práctica en la misión 3), la siguiente que sí tenga
        setCurrentPhase(resolvePhase(startPhase, getMissionPhases(resolvedMission.id)));
      } catch (error) {
        console.error(error);
        setCurrentPhase("conversation"); // fallback seguro
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [id, inscripcion]); // eslint-disable-line react-hooks/exhaustive-deps

  const phases       = mission ? getMissionPhases(mission.id) : DEFAULT_PHASES;
  const phaseWeights = getPhaseWeights(phases);

  const completedPhases = currentPhase
    ? phases.slice(0, phases.indexOf(currentPhase))
    : [];

  const baseProgress = completedPhases.reduce(
    (sum, p) => sum + (phaseWeights[p] ?? 0),
    0,
  );

  const goToPhase = useCallback((phase) => {
    setCurrentPhase(phase);
  }, []);

  const advancePhase = useCallback(
    async (completedPhase, metadata = {}) => {
      const missionPhases = getMissionPhases(mission.id);
      const nextIdx = missionPhases.indexOf(completedPhase) + 1;
      if (nextIdx >= missionPhases.length) return;

      const nextPhase = missionPhases[nextIdx];
      setCurrentPhase(nextPhase);

      const payload = {
        idInscripcion: inscripcion.idInscripcion,
        missionId: mission.id,
        currentPhase: nextPhase,
      };
      if (completedPhase === "learning")    payload.learningCompleted   = "Y";
      if (completedPhase === "practice") {
        payload.practiceCompleted = "Y";
        if (metadata.score !== undefined) {
          payload.practiceScore = metadata.score;
          setPracticeScore(metadata.score);
        }
      }
      if (completedPhase === "assessment")  payload.assessmentCompleted = "Y";

      await updatePhase(payload).catch(console.error);
    },
    [inscripcion, mission],
  );

  if (loading || currentPhase === null) {
    return (
      <MainLayout>
        <Loader />
      </MainLayout>
    );
  }

  if (!mission) {
    return (
      <MainLayout>
        <div className="text-white p-10">Mission not found</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-6 sm:mb-10">
        <h1 className="text-white text-3xl sm:text-5xl font-bold">{mission.title}</h1>
        <p className="text-zinc-400 mt-2 sm:mt-4 text-base sm:text-lg">{mission.description}</p>
      </div>

      <MissionPhaseNavigator
        phases={phases}
        currentPhase={currentPhase}
        completedPhases={completedPhases}
        onPhaseClick={goToPhase}
      />

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-8">
        <div className="order-2 xl:order-1">
          <MissionSidebar
            mission={mission}
            progress={progress}
            currentPhase={currentPhase}
            phases={phases}
            missionContent={missionContent}
          />
        </div>

        <div className="order-1 xl:order-2 xl:col-span-2">
          {currentPhase === "learning" && (
            <LearningGuide
              missionContent={missionContent}
              onComplete={() => advancePhase("learning")}
              isCompleted={completedPhases.includes("learning")}
            />
          )}

          {currentPhase === "practice" && (
            <PracticeZone
              missionContent={missionContent}
              missionId={mission.id}
              levelCode={student?.nivel ?? "A1"}
              onComplete={(score) => advancePhase("practice", { score })}
              isCompleted={completedPhases.includes("practice")}
            />
          )}

          {currentPhase === "conversation" && (
            <TutorChat
              mission={mission}
              setProgress={setProgress}
              currentPhase={currentPhase}
              missionContent={missionContent}
              practiceScore={practiceScore}
              baseProgress={baseProgress}
              onComplete={() => advancePhase("conversation")}
            />
          )}

          {currentPhase === "assessment" && getAssessmentType(mission.id) === "spelling" && (
            <SpellingAssessment
              missionContent={missionContent}
              missionId={mission.id}
              baseProgress={baseProgress}
              phaseWeight={phaseWeights.assessment}
              setProgress={setProgress}
              onComplete={() => advancePhase("assessment")}
            />
          )}

          {currentPhase === "assessment" && getAssessmentType(mission.id) === "pronunciation" && (
            <PronunciationAssessment
              missionContent={missionContent}
              missionId={mission.id}
              baseProgress={baseProgress}
              phaseWeight={phaseWeights.assessment}
              setProgress={setProgress}
              onComplete={() => advancePhase("assessment")}
            />
          )}

          {currentPhase === "completion" && (
            <CompletionScreen
              mission={mission}
              phases={phases}
              practiceScore={practiceScore}
            />
          )}
        </div>
      </div>
    </MainLayout>
  );
}

