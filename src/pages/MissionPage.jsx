import { useParams, useLocation } from "react-router-dom";

export default function MissionPage() {
  const { id } = useParams();

  const location = useLocation();

  const mission = location.state?.mission;

  console.log("MISSION:", mission);

  if (!mission) {
    return <div style={{ color: "white" }}>Mission not found</div>;
  }

  return (
    <div
      style={{
        color: "white",
        padding: "40px",
        background: "black",
        minHeight: "100vh",
      }}
    >
      <h1>MISSION PAGE WORKS</h1>

      <p>{mission.title}</p>

      <p>{mission.description}</p>

      <p>{mission.level}</p>

      <p>{mission.duration}</p>
    </div>
  );
}
