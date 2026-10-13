require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const PORT = 3000;

const db = new Pool({
    user: "postgres",
    host: "localhost",
    database: "BlogDB",
    password: process.env.DB_PASSWORD,
    port: 5432
});

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
    secret: "change-this-to-a-random-secret",
    resave: false,
    saveUninitialized: false
}));

app.get("/", async (req, res) => {
    try {
        const result = await db.query(`
            SELECT blogs.*, users.username
            FROM blogs
            JOIN users ON blogs.user_id = users.id
            ORDER BY blogs.created_at DESC
        `);

        res.render("index", {
            posts: result.rows,
            user: req.session.user,
            error: null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Could not load blog posts.");
    }
});

app.get("/signup", (req, res) => {
    res.render("signup", { error: null });
});

app.post("/signup", async (req, res) => {
    const { username, password } = req.body;

    try {
        const hash = await bcrypt.hash(password, 10);

        await db.query(
            "INSERT INTO users (username, password) VALUES ($1, $2)",
            [username, hash]
        );

        res.redirect("/login");
    } catch (err) {
        res.status(400).send("Signup failed. That username may already exist.");
    }
});

app.get("/login", (req, res) => {
    res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await db.query(
            "SELECT * FROM users WHERE username = $1",
            [username]
        );

        if (result.rows.length === 0 ||
            !(await bcrypt.compare(password, result.rows[0].password))) {
            return res.status(401).render("login", {
                error: "Incorrect username or password."
            });
        }

        req.session.user = {
            id: result.rows[0].id,
            username: result.rows[0].username
        };

        res.redirect("/");
    } catch (err) {
        console.error(err);
        res.status(500).send("Login failed.");
    }
});

app.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
});

app.post("/posts", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    const { title, content } = req.body;

    try {
        await db.query(
            "INSERT INTO blogs (title, content, user_id) VALUES ($1, $2, $3)",
            [title, content, req.session.user.id]
        );

        res.redirect("/");
    } catch (err) {
        console.error(err);
        res.status(500).send("Could not create post.");
    }
});

app.get("/posts/edit/:id", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    try {
        const result = await db.query(
            "SELECT * FROM blogs WHERE id = $1 AND user_id = $2",
            [req.params.id, req.session.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(403).send("Post not found or not yours.");
        }

        res.render("edit", { post: result.rows[0], id: req.params.id });
    } catch (err) {
        console.error(err);
        res.status(500).send("Could not open post.");
    }
});

app.post("/posts/edit/:id", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    try {
        await db.query(
            `UPDATE blogs SET title = $1, content = $2
             WHERE id = $3 AND user_id = $4`,
            [req.body.title, req.body.content,
             req.params.id, req.session.user.id]
        );

        res.redirect("/");
    } catch (err) {
        console.error(err);
        res.status(500).send("Could not update post.");
    }
});

app.post("/posts/delete/:id", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    try {
        await db.query(
            "DELETE FROM blogs WHERE id = $1 AND user_id = $2",
            [req.params.id, req.session.user.id]
        );

        res.redirect("/");
    } catch (err) {
        console.error(err);
        res.status(500).send("Could not delete post.");
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    db.query("SELECT NOW()")
        .then(() => console.log("Connected to PostgreSQL successfully"))
        .catch(err => console.error("Database connection error:", err.message));
});
