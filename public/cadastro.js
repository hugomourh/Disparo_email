const form = document.getElementById("formCadastro");
const statusEl = document.getElementById("status");
const pagamentoDiv = document.getElementById("pagamento");
const pixBox = document.getElementById("pixBox");
const pixStatus = document.getElementById("pixStatus");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nome = document.getElementById("nome").value;
  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;

  try {
    // cria usuário
    const res = await fetch("/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha })
    });

    const data = await res.json();

    if (data.erro) {
      statusEl.textContent = "Erro ao criar conta: " + data.erro;
      return;
    }

    statusEl.textContent = "Conta criada! Agora finalize o pagamento.";

    // mostra área de pagamento
    pagamentoDiv.style.display = "block";

    // gera PIX
    const token = data.token; // o token retornado no backend
    const pixRes = await fetch("/pix/criar", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    const dataPix = await pixRes.json();

    if (dataPix.erro || !dataPix.qr_code) {
      pixStatus.textContent = "Erro ao gerar PIX";
      console.error(dataPix);
      return;
    }

    // mostra QR Code e link
    pixBox.innerHTML = `
      <img src="data:image/png;base64,${dataPix.qr_code_base64}" alt="QR Code PIX" style="max-width:300px;"/>
      <p>Código PIX: <code>${dataPix.qr_code}</code></p>
      <a href="${dataPix.ticket_url}" target="_blank">Abrir no Mercado Pago</a>
    `;
    pixBox.style.display = "block";
    pixStatus.textContent = "Pagamento pendente. Use o QR Code ou link acima.";

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Erro no processo de cadastro.";
  }
});
