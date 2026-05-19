export async function loginStudent(matricula, password) {
  const response = await fetch(
    "https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/auth/login",

    {
      method: "POST",

      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },

      body: `x01=${matricula}&x02=${password}`,
    },
  );

  if (!response.ok) {
    throw new Error("Login failed");
  }

  return response.json();
}
