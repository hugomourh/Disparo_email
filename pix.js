import pool from "./db.js";
import fetch from "node-fetch";

const VALOR_PLANO = 29.99;

export async function criarPix(req, res) {
  try {
    const userId = req.user.id;
    const email = req.user.email;

    // chave única para evitar duplicidade
    const externalReference = `${userId}-${Date.now()}`;

    // corpo da requisição para o Mercado Pago
    const body = {
      transaction_amount: VALOR_PLANO,
      description: "Plano mensal R$29,99",
      payment_method_id: "pix",
      payer: { email },
      external_reference: externalReference
    };

    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        "X-Idempotency-Key": externalReference
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro Mercado Pago:", data);
      return res.status(400).json({ erro: "Erro ao gerar PIX", detalhe: data });
    }

    // pega dados do QR Code
    const pixData = data.point_of_interaction?.transaction_data;

    if (!pixData) {
      console.error("Dados PIX ausentes:", data);
      return res.status(400).json({ erro: "Erro ao gerar PIX", detalhe: data });
    }

    // salva pagamento pendente no banco
    await pool.query(
      "INSERT INTO pagamentos_pix (user_id, txid, status, valor) VALUES ($1,$2,$3,$4)",
      [userId, externalReference, "pending", VALOR_PLANO]
    );

    res.json({
      ok: true,
      txid: externalReference,
      qr_code: pixData.qr_code,
      qr_code_base64: pixData.qr_code_base64,
      ticket_url: pixData.ticket_url
    });

  } catch (err) {
    console.error("Erro ao criar PIX:", err);
    res.status(500).json({ erro: "Erro ao criar PIX" });
  }
}
