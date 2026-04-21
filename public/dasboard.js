const btnDisparo = document.getElementById("btnDisparo");
const status = document.getElementById("status");


function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}


btnDisparo.addEventListener("click", async () => {
  const emails = document.getElementById("emails").value
    .split(",")
    .map(e => e.trim())
    .filter(e => e);

  const assunto = document.getElementById("assunto").value.trim();
  const mensagem = document.getElementById("mensagem").value.trim();
  const token = localStorage.getItem("token");

  if (!token) {
    status.innerText = "❌ Você precisa estar logado.";
    return;
  }

  if (emails.length === 0 || !mensagem) {
    status.innerText = "❌ Preencha emails e mensagem.";
    return;
  }

  const invalidos = emails.filter(e => !validarEmail(e));
  if (invalidos.length > 0) {
    status.innerText = `❌ Emails inválidos: ${invalidos.join(", ")}`;
    return;
  }

  status.innerText = "⏳ Enviando emails...";
  btnDisparo.disabled = true;
  btnDisparo.innerText = "Enviando...";

  try {
    const res = await fetch("http://localhost:4000/disparo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ emails, assunto, mensagem })
    });

    const data = await res.json();

    if (data.ok) {
      status.innerText = `✅ ${data.enviados} emails enviados com sucesso!`;
      document.getElementById("emails").value = "";
      document.getElementById("assunto").value = "";
      document.getElementById("mensagem").value = "";
      carregarHistorico(); 
    } else {
      status.innerText = `❌ ${data.erro || "Erro ao enviar"}`;
    }
  } catch (err) {
    console.error(err);
    status.innerText = "❌ Erro ao conectar com o servidor.";
  } finally {
    btnDisparo.disabled = false;
    btnDisparo.innerText = "Disparar";
  }
});

async function carregarHistorico() {
  const token = localStorage.getItem("token");
  if (!token) return;

  const res = await fetch("http://localhost:4000/historico", {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  const dados = await res.json();
  const tbody = document.getElementById("historico");

  if (!tbody) return;

  tbody.innerHTML = "";

  dados.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td>${item.destinatario}</td>
        <td>${item.assunto}</td>
        <td>${item.status}</td>
        <td>${new Date(item.criado_em).toLocaleString()}</td>
      </tr>
    `;
  });
}

carregarHistorico();
