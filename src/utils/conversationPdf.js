import jsPDF from "jspdf";

export function exportConversationPdf(mission, messages, student) {
  const doc = new jsPDF();

  let y = 20;

  /*
    Current Date
  */
  const currentDate = new Date().toLocaleString();

  /*
    HEADER
  */
  doc.setFontSize(22);

  doc.text("ActivaInglés", 20, y);

  y += 12;

  /*
    Topic
  */
  doc.setFontSize(16);

  doc.text(
    `Topic ${mission.topicSortOrder || ""}. ${mission.topicTitle || ""}`,
    20,
    y,
  );

  y += 10;

  /*
    Mission
  */
  doc.text(`Mission ${mission.sortOrder || ""}. ${mission.title}`, 20, y);

  y += 12;

  /*
    Student Info
  */
  doc.setFontSize(12);

  doc.text(`Student: ${student.nombre || ""}`, 20, y);

  y += 8;

  doc.text(`Enrollment: ${student.matricula || ""}`, 20, y);

  y += 8;

  doc.text(`Generated: ${currentDate}`, 20, y);

  y += 12;

  /*
    Divider
  */
  doc.line(20, y, 190, y);

  y += 15;

  /*
    Conversation
  */
  messages.forEach((msg) => {
    /*
      Sender
    */
    const sender = msg.sender === "user" ? "Student" : "Tutor";

    /*
      Message text
    */
    let messageText = msg.text || "";

    /*
      Remove problematic unicode/emojis
    */
    messageText = messageText.replace(/[^\x00-\x7F]/g, "");

    const text = `${sender}: ${messageText}`;

    const lines = doc.splitTextToSize(text, 170);

    /*
      Sender color
    */
    if (sender === "Student") {
      doc.setTextColor(0, 120, 255);
    } else {
      doc.setTextColor(0, 0, 0);
    }

    doc.text(lines, 20, y);

    y += lines.length * 8;

    /*
      Correction
    */
    if (msg.correction) {
      const correction = `Correction: ${msg.correction}`;

      const correctionLines = doc.splitTextToSize(correction, 160);

      doc.setTextColor(220, 0, 0);

      doc.text(correctionLines, 25, y);

      y += correctionLines.length * 8;
    }

    /*
      Reset color
    */
    doc.setTextColor(0, 0, 0);

    y += 10;

    /*
      New Page
    */
    if (y > 270) {
      doc.addPage();

      y = 20;
    }
  });

  /*
    Save PDF
  */
  doc.save(`${mission.title}.pdf`);
}
