import express from "express";
import bcrypt from "bcrypt";
import pool from "./db.js";

const router = express.Router();

// ================= CADASTRO / CONFIRMAÇÃO =================
router.post("/", async (req, res) => {
  const { name, email, senha } = req.body;

  try {
    const result = await pool.query(
      "SELECT id, status FROM users WHERE email = $1",
      [email]
    );

    // EMAIL JÁ EXISTE
    if (result.rows.length > 0) {
      const user = result.rows[0];

      // JÁ ATIVO → BLOQUEIA
      if (user.status === "ativo") {
        return res.status(400).json({
          erro: "Usuário já possui plano ativo"
        });
      }

      // PENDENTE → PERMITE PAGAMENTO
      return res.json({
        ok: true,
        existente: true
      });
    }

    // USUÁRIO NOVO
    const senhaHash = await bcrypt.hash(senha, 10);

    await pool.query(
      `
      INSERT INTO users (name, email, password_hash, status)
      VALUES ($1, $2, $3, 'pendente')
      `,
      [name, email, senhaHash]
    );

    res.status(201).json({
      ok: true,
      existente: false
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro no servidor" });
  }
});

export default router;
