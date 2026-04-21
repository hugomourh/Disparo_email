import "./env.js";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./db.js";
import { criarPix } from "./pix.js";
import usuarioRoutes from "./usuario.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ================= PATH =================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ================= AUTH =================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ erro: "Token não fornecido" });

  const token = authHeader.split(" ")[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: "Token inválido" });
  }
}

// ================= ROTAS =================
app.use("/usuarios", usuarioRoutes);

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rowCount === 0) return res.status(400).json({ error: "Usuário não encontrado" });

    const user = result.rows[0];
    const bcrypt = (await import("bcrypt")).default;
    const ok = await bcrypt.compare(senha, user.password_hash);
    if (!ok) return res.status(400).json({ error: "Senha incorreta" });

    let planoAtivo = false;
    if (user.ultimo_pagamento) {
      const diff = (new Date() - new Date(user.ultimo_pagamento)) / (1000*60*60*24);
      if (diff < 30 && user.status === "ativo") planoAtivo = true;
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "2h" });

    if (!planoAtivo) {
      return res.json({
        ok: false,
        error: "Conta pendente. Finalize o pagamento.",
        token
      });
    }

    res.json({ ok: true, token });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

// ================= PIX =================
app.post("/pix/criar", authMiddleware, criarPix);

app.get("/pix/status/:txid", authMiddleware, async (req, res) => {
  try {
    const { txid } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT status FROM pagamentos_pix WHERE txid = $1 AND user_id = $2",
      [txid, userId]
    );

    if (result.rowCount === 0) return res.status(404).json({ erro: "Pagamento não encontrado" });

    res.json({ status: result.rows[0].status });
  } catch (err) {
    console.error("Erro ao consultar status PIX:", err);
    res.status(500).json({ erro: "Erro ao consultar status PIX" });
  }
});

// ================= WEBHOOK MERCADO PAGO =================
app.post("/webhook/mercadopago", async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type !== "payment" || !data?.id) return res.sendStatus(200);

    const paymentId = data.id;

    // chama a API Mercado Pago direto via fetch
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const paymentInfo = await mpRes.json();

    if (paymentInfo.status === "approved" && paymentInfo.payment_method_id === "pix") {

      // Atualiza status do pagamento no banco
      await pool.query(
        "UPDATE pagamentos_pix SET status = 'paid' WHERE txid = $1",
        [paymentInfo.external_reference]
      );

      // Ativa usuário e atualiza data do último pagamento
      await pool.query(
        `UPDATE users
         SET status = 'ativo', ultimo_pagamento = NOW()
         WHERE id = (
           SELECT user_id FROM pagamentos_pix WHERE txid = $1
         )`,
        [paymentInfo.external_reference]
      );

      console.log("✅ Pagamento PIX aprovado:", paymentInfo.id);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook Mercado Pago:", err);
    res.sendStatus(500);
  }
});

// ================= EMAIL =================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// ================= HTML =================
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/dashboard", (_, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("/cadastro", (_, res) => res.sendFile(path.join(__dirname, "public", "cadastro.html")));

// ================= LOG ENV =================
console.log("============== VARIÁVEIS DE AMBIENTE ==============");
console.log("MP_ACCESS_TOKEN:", process.env.MP_ACCESS_TOKEN);
console.log("JWT_SECRET:", process.env.JWT_SECRET);
console.log("SMTP_USER:", process.env.SMTP_USER);
console.log("SMTP_HOST:", process.env.SMTP_HOST);
console.log("SMTP_PORT:", process.env.SMTP_PORT);
console.log("====================================================");

// ================= SERVER =================
app.listen(PORT, () => console.log(`🚀 Servidor rodando em http://localhost:${PORT}`));
