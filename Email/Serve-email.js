import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// carregar .env da mesma pasta
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

// caminho do json
const emailsPath = path.join(__dirname, "Data", "emails.json");

/* ==================================
   CONFIGURAÇÃO DE ENVIO
================================== */

// 1 e-mail a cada 60 segundos (1 minuto)
const ESPERA_ENTRE_EMAILS_MS = 60 * 1000;

console.log("==================================");
console.log("INICIANDO SERVIDOR EMAIL");
console.log("PASTA DO SCRIPT:", __dirname);
console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log(
  "EMAIL_PASS:",
  process.env.EMAIL_PASS ? "CARREGADO OK" : "NÃO CARREGOU"
);
console.log("PORTA:", PORT);
console.log("JSON:", emailsPath);
console.log("MODO DE ENVIO: 1 e-mail por minuto (60s)");
console.log("==================================");

// servir arquivos estáticos
app.use(express.static(__dirname));

/* ==================================
   FUNÇÕES
================================== */

function carregarEmails() {
  if (!fs.existsSync(emailsPath)) {
    throw new Error(`Arquivo não encontrado: ${emailsPath}`);
  }

  const conteudo = fs.readFileSync(emailsPath, "utf-8");
  const lista = JSON.parse(conteudo);

  if (!Array.isArray(lista)) {
    throw new Error("emails.json precisa conter um array.");
  }

  return lista;
}

function normalizarEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function removerDuplicados(lista) {
  const mapa = new Map();

  for (const item of lista) {
    const email = normalizarEmail(item.email);

    if (!email) continue;

    if (!mapa.has(email)) {
      mapa.set(email, {
        ...item,
        email
      });
    }
  }

  return Array.from(mapa.values());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ==================================
   ROTAS
================================== */

app.get("/", (req, res) => {
  console.log("Acessou página inicial");
  res.sendFile(path.join(__dirname, "Email.html"));
});

app.get("/api/emails-json", (req, res) => {
  try {
    const listaOriginal = carregarEmails();
    const lista = removerDuplicados(listaOriginal);

    return res.json({
      origem: "Data/emails.json",
      totalOriginal: listaOriginal.length,
      totalUnicos: lista.length,
      emails: lista
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/send", async (req, res) => {
  try {
    console.log("==================================");
    console.log("NOVA REQUISIÇÃO DE ENVIO");

    const { assunto, mensagem } = req.body;

    if (!assunto || !mensagem) {
      return res.status(400).json({
        ok: false,
        error: "assunto e mensagem são obrigatórios"
      });
    }

    const listaOriginal = carregarEmails();
    const emails = removerDuplicados(listaOriginal);

    console.log("TOTAL ORIGINAL:", listaOriginal.length);
    console.log("TOTAL ÚNICO:", emails.length);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    console.log("Verificando SMTP...");
    await transporter.verify();
    console.log("SMTP OK");

    const resultados = [];

    for (let i = 0; i < emails.length; i++) {
      const contato = emails[i];

      try {
        console.log(`[${i + 1}/${emails.length}] Enviando para:`, contato.email);

        const info = await transporter.sendMail({
          from: `"Vista Verdurão" <${process.env.EMAIL_USER}>`,
          to: contato.email,
          subject: assunto,
          text: mensagem.replace(/<[^>]*>/g, ""),
          html: mensagem
        });

        resultados.push({
          nome: contato.nome || "",
          email: contato.email,
          status: "enviado",
          response: info.response
        });

        console.log("OK:", contato.email);

      } catch (error) {
        resultados.push({
          nome: contato.nome || "",
          email: contato.email,
          status: "erro",
          error: error.message
        });

        console.log("ERRO:", contato.email);
        console.log(error.message);
      }

      // Aguarda 1 minuto (60000 ms) antes do próximo envio
      const temMais = i < emails.length - 1;
      if (temMais) {
        console.log("Aguardando 1 minuto para o próximo envio...");
        await sleep(ESPERA_ENTRE_EMAILS_MS);
      }
    }

    console.log("==================================");
    console.log("ENVIO FINALIZADO");
    console.log("==================================");

    return res.json({
      ok: true,
      totalOriginal: listaOriginal.length,
      totalUnicos: emails.length,
      enviados: resultados.filter(r => r.status === "enviado").length,
      erros: resultados.filter(r => r.status === "erro").length,
      resultados
    });

  } catch (error) {
    console.log("ERRO GERAL");
    console.log(error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* ==================================
   START
================================== */

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});