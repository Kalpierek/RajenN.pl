require('dotenv').config(); 
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    StringSelectMenuBuilder 
} = require('discord.js');
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const ms = require('ms');
const axios = require('axios');
const cors = require('cors');

const TOKEN = process.env.DISCORD_TOKEN; 
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// ==========================================
// KONFIGURACJA ID RÓL I KANAŁÓW
// ==========================================
const ROLE_OWNER = "1518341786509115560"; // Pełny dostęp do wszystkiego
const ROLE_OPIEKUN = "1518341786509115557"; // Tylko moderacja (ban, mute)
const ROLE_VERIFIED = "1518341786492473375"; // Ranga po weryfikacji
const ROLE_CLIENT = "1518341786492473376"; // Ranga Klienta do pisania opinii

const CHAN_TICKETS = "1518341787457163268";
const CHAN_PREMIUM = "1518341787742245092";
const CHAN_OPINIE = "1518341787457163270";
const CHAN_CENNIK = "1518341787457163269";
const CHAN_VERIFY = "1518341787154911395";
const CHAN_WELCOME = "1518341787154911393"; // Powitalnia i Pożegnania
const CHAN_RULES = "1518341787154911397";
const CHAN_GIVEAWAYS = "1518341787154911401";
const CHAN_ANNOUNCEMENTS = "TUTAJ_WPISZ_ID_KANALU_OGLOSZEN"; // Kanał na automatyczne wpisy RajenNa

// Kategorie dla tworzonych ticketów
const TICKET_CATEGORIES = {
    'zamowienie': '1518341788316995634',
    'pomoc': '1518341788316995635',
    'blad': '1518341788316995637',
    'wspolpraca': '1518341788316995640',
    'premium': '1518341788316995634'
};

if (!TOKEN) {
    console.error("❌ BŁĄD: Brak tokenu bota w pliku .env!");
    process.exit(1);
}

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ] 
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'rajenn-secret-key-123',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));
app.use(express.static(path.join(__dirname, 'public')));


// ==========================================
// API DLA PANELU ADMINA (AUTORYZACJA I TICKETY)
// ==========================================
// ==========================================
// API DLA PANELU ADMINA (AUTORYZACJA I TICKETY)
// ==========================================
const ownerCode = process.env.ADMIN_CODE_OWNER || "WlascicielRajenn2026!";
const opiekunCode = process.env.ADMIN_CODE_OPIEKUN || "OpiekunRajenn2026!";

function checkAuth(req) {
    // 1. Sprawdzenie nagłówka Authorization (kod dostępu)
    const token = req.headers['authorization'];
    if (token) {
        if (token === ownerCode) {
            return { success: true, role: 'owner' };
        }
        if (token === opiekunCode) {
            return { success: true, role: 'opiekun' };
        }
    }

    // 2. Sprawdzenie sesji (zalogowanie przez Discord)
    if (req.session && req.session.user) {
        return { success: true, role: req.session.user.role, user: req.session.user };
    }

    return { success: false };
}

// Konfiguracja autoryzacji
app.get('/api/auth/config', (req, res) => {
    res.json({
        discordEnabled: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET)
    });
});

app.get('/api/auth/me', (req, res) => {
    const auth = checkAuth(req);
    if (auth.success) {
        res.json({ loggedIn: true, role: auth.role, user: auth.user || null });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: "Błąd podczas wylogowania" });
        }
        res.json({ success: true });
    });
});

app.post('/api/auth', (req, res) => {
    const { password } = req.body;
    if (password === ownerCode) {
        req.session.user = { role: 'owner', username: 'Właściciel (Kod)', avatar: null };
        return res.json({ success: true, role: 'owner' });
    } else if (password === opiekunCode) {
        req.session.user = { role: 'opiekun', username: 'Opiekun (Kod)', avatar: null };
        return res.json({ success: true, role: 'opiekun' });
    } else {
        res.status(401).json({ error: "Błędne hasło" });
    }
});

// Logowanie Discord OAuth2
app.get('/api/auth/discord', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) {
        return res.status(400).send("Logowanie Discord nie jest skonfigurowane (brak DISCORD_CLIENT_ID).");
    }
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/discord/callback`;
    const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
    res.redirect(authorizeUrl);
});

app.get('/api/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.redirect('/Ticket.html?error=no_code');
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/discord/callback`;

    try {
        // 1. Wymiana code na access_token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const accessToken = tokenResponse.data.access_token;

        // 2. Pobranie danych profilu użytkownika
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const discordUser = userResponse.data;

        // 3. Sprawdzenie obecności i rang na serwerze Discord
        const guild = client.guilds.cache.first(); // Pobieramy pierwszą gildię, na której jest bot
        if (!guild) {
            console.error("❌ Bot nie jest połączony z żadnym serwerem Discord!");
            return res.status(500).send("Błąd: Bot nie jest połączony z żadnym serwerem Discord.");
        }

        let member;
        try {
            member = await guild.members.fetch(discordUser.id);
        } catch (e) {
            return res.status(403).send("Brak dostępu: Nie znaleziono Cię na serwerze Discord bota.");
        }

        const isOwner = member.roles.cache.has(ROLE_OWNER);
        const isOpiekun = member.roles.cache.has(ROLE_OPIEKUN);

        if (!isOwner && !isOpiekun) {
            return res.status(403).send("Brak uprawnień: Nie posiadasz wymaganej roli (Właściciel lub Opiekun) na serwerze Discord.");
        }

        // 4. Budowanie adresu URL avatara
        const avatarUrl = discordUser.avatar
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.id) % 5}.png`;

        // 5. Zapis w sesji
        req.session.user = {
            id: discordUser.id,
            username: discordUser.username,
            globalName: discordUser.global_name || discordUser.username,
            avatar: avatarUrl,
            role: isOwner ? 'owner' : 'opiekun'
        };

        res.redirect('/Ticket.html');
    } catch (error) {
        console.error("❌ Błąd autoryzacji Discord OAuth2:", error.response ? error.response.data : error.message);
        res.status(500).send("Wystąpił błąd podczas autoryzacji Discord OAuth2.");
    }
});

app.get('/api/tickets', async (req, res) => {
    const auth = checkAuth(req);
    if (!auth.success) return res.status(401).json({ error: "Brak autoryzacji" });

    try {
        const guild = client.guilds.cache.first();
        if (!guild) return res.json([]);
        const channels = await guild.channels.fetch();
        const tickets = channels
            .filter(c => c.type === ChannelType.GuildText && c.name.startsWith('ticket-'))
            .map(c => ({ id: c.id, name: c.name }));
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: "Błąd serwera" });
    }
});

app.get('/api/tickets/:channelId', async (req, res) => {
    const auth = checkAuth(req);
    if (!auth.success) return res.status(401).json({ error: "Brak autoryzacji" });

    const { channelId } = req.params;
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return res.status(404).json({ error: "Gildia nie znaleziona" });
        const channel = await guild.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) return res.status(404).json({ error: "Kanał nie znaleziony" });

        const messages = await channel.messages.fetch({ limit: 50 });
        const sortedMessages = [...messages.values()]
            .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
            .map(m => ({
                id: m.id,
                author: m.author.username,
                isBot: m.author.bot,
                content: m.content,
                timestamp: m.createdTimestamp
            }));

        res.json({ messages: sortedMessages });
    } catch (err) {
        res.status(500).json({ error: "Błąd serwera" });
    }
});

app.post('/api/tickets/:channelId/send', async (req, res) => {
    const auth = checkAuth(req);
    if (!auth.success) return res.status(401).json({ error: "Brak autoryzacji" });

    const { channelId } = req.params;
    const { message } = req.body;

    try {
        const guild = client.guilds.cache.first();
        if (!guild) return res.status(404).json({ error: "Gildia nie znaleziona" });
        const channel = await guild.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ error: "Kanał nie znaleziony" });

        await channel.send(message);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Błąd podczas wysyłania" });
    }
});

app.post('/api/tickets/:channelId/close', async (req, res) => {
    const auth = checkAuth(req);
    if (!auth.success) return res.status(401).json({ error: "Brak autoryzacji" });

    const { channelId } = req.params;
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return res.status(404).json({ error: "Gildia nie znaleziona" });
        const channel = await guild.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ error: "Kanał nie znaleziony" });

        await channel.delete();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Błąd podczas zamykania" });
    }
});


app.get('/api/stats', async (req, res) => {
    try {
        const db = loadData();
        let activeTickets = 0;
        try {
            const guild = client.guilds.cache.first();
            if (guild) {
                const channels = await guild.channels.fetch();
                activeTickets = channels.filter(c => c.type === ChannelType.GuildText && c.name.startsWith('ticket-')).size;
            }
        } catch (err) {
            console.error("Błąd pobierania ticketów dla statystyk:", err);
        }
        res.json({
            tickets: activeTickets,
            plugins: db.plugins ? db.plugins.length : 0,
            scripts: db.scripts ? db.scripts.length : 0
        });
    } catch (e) {
        res.status(500).json({ error: "Błąd serwera" });
    }
});

function loadData() {
    let structure = { modpacks: [], plugins: [], scripts: [] };
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(structure, null, 4), 'utf8');
        return structure;
    }
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return structure;
    }
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4), 'utf8');
    syncToGitHub();
}

async function syncToGitHub() {
    const ghToken = process.env.GH_TOKEN;
    const ghRepo = process.env.GH_REPO;
    const ghBranch = process.env.GH_BRANCH || 'main';
    const ghPath = process.env.GH_PATH || 'data.json';

    if (!ghToken || !ghRepo) {
        console.log('[SYNC] Brak konfiguracji GitHub (GH_TOKEN lub GH_REPO) w .env. Pomijam sync.');
        return;
    }

    try {
        const fileUrl = `https://api.github.com/repos/${ghRepo}/contents/${ghPath}`;
        const headers = {
            'Authorization': `token ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Discord-Bot-Sync'
        };

        // 1. Pobieramy aktualny plik z GitHub, by dostać sha
        let sha = null;
        try {
            const getRes = await axios.get(`${fileUrl}?ref=${ghBranch}`, { headers });
            sha = getRes.data.sha;
        } catch (err) {
            if (err.response && err.response.status !== 404) throw err;
        }

        // 2. Kodujemy lokalny data.json do Base64
        const localContent = fs.readFileSync(DATA_FILE, 'utf8');
        const contentBase64 = Buffer.from(localContent).toString('base64');

        // 3. Wysyłamy PUT
        const putBody = {
            message: '🤖 [Bot Sync] Aktualizacja bazy danych data.json',
            content: contentBase64,
            branch: ghBranch
        };
        if (sha) putBody.sha = sha;

        const putRes = await axios.put(fileUrl, putBody, { headers });
        console.log(`[SYNC] Pomyślnie zsynchronizowano data.json z GitHub! Commit SHA: ${putRes.data.commit.sha}`);
    } catch (error) {
        console.error('[SYNC] Błąd podczas synchronizacji z GitHub:', error.response ? error.response.data : error.message);
    }
}

// ==========================================
// REJESTRACJA KOMEND SLASH (Zabezpieczone permisjami)
// ==========================================
const commandsData = [
    new SlashCommandBuilder()
        .setName('dodajplugin')
        .setDescription('Dodaje nowy plugin')
        .addStringOption(o => o.setName('id').setDescription('ID (np. 1, 2, essentials)').setRequired(true))
        .addStringOption(o => o.setName('informacje').setDescription('Nazwa/informacje o pluginie').setRequired(true))
        .addStringOption(o => o.setName('opis').setDescription('Opis pluginu').setRequired(true))
        .addStringOption(o => o.setName('wersja').setDescription('Wersje pluginu').setRequired(true))
        .addStringOption(o => o.setName('youtube').setDescription('Link do prezentacji YouTube').setRequired(false))
        .addStringOption(o => o.setName('pobierz').setDescription('Link do pobrania pluginu').setRequired(false))
        .addStringOption(o => o.setName('typ').setDescription('Typ pluginu').setRequired(false).addChoices({ name: 'FREE', value: 'free' }, { name: 'PREMIUM', value: 'premium' }))
        .addStringOption(o => o.setName('cena').setDescription('Cena (np. 15 PLN)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('usunplugin')
        .setDescription('Usuwa plugin')
        .addStringOption(o => o.setName('id').setDescription('ID pluginu do usunięcia').setRequired(true)),

    new SlashCommandBuilder()
        .setName('dodajpaczke')
        .setDescription('Dodaje nową paczkę')
        .addStringOption(o => o.setName('id').setDescription('ID paczki').setRequired(true))
        .addStringOption(o => o.setName('informacje').setDescription('Nazwa/informacje o paczce').setRequired(true))
        .addStringOption(o => o.setName('opis').setDescription('Opis paczki').setRequired(true))
        .addStringOption(o => o.setName('wersja').setDescription('Wersje gry/paczki').setRequired(true))
        .addStringOption(o => o.setName('youtube').setDescription('Link do filmu YouTube').setRequired(false))
        .addStringOption(o => o.setName('pobierz').setDescription('Link do pobrania paczki').setRequired(false))
        .addStringOption(o => o.setName('typ').setDescription('Typ paczki').setRequired(false).addChoices({ name: 'FREE', value: 'free' }, { name: 'PREMIUM', value: 'premium' }))
        .addStringOption(o => o.setName('cena').setDescription('Cena paczki').setRequired(false)),

    new SlashCommandBuilder()
        .setName('usunpaczke')
        .setDescription('Usuwa paczkę')
        .addStringOption(o => o.setName('id').setDescription('ID paczki do usunięcia').setRequired(true)),

    new SlashCommandBuilder()
        .setName('dodajskrypt')
        .setDescription('Dodaje nowy skrypt')
        .addStringOption(o => o.setName('id').setDescription('ID skryptu').setRequired(true))
        .addStringOption(o => o.setName('informacje').setDescription('Nazwa/informacje o skrypcie').setRequired(true))
        .addStringOption(o => o.setName('opis').setDescription('Opis skryptu').setRequired(true))
        .addStringOption(o => o.setName('wersja').setDescription('Wymagania/wersja').setRequired(true))
        .addStringOption(o => o.setName('youtube').setDescription('Link do filmu YouTube').setRequired(false))
        .addStringOption(o => o.setName('pobierz').setDescription('Link do pobrania skryptu').setRequired(false))
        .addStringOption(o => o.setName('typ').setDescription('Typ skryptu').setRequired(false).addChoices({ name: 'FREE', value: 'free' }, { name: 'PREMIUM', value: 'premium' }))
        .addStringOption(o => o.setName('cena').setDescription('Cena skryptu').setRequired(false)),

    new SlashCommandBuilder()
        .setName('usunskrypt')
        .setDescription('Usuwa skrypt')
        .addStringOption(o => o.setName('id').setDescription('ID skryptu do usunięcia').setRequired(true)),

    new SlashCommandBuilder().setName('statystyki').setDescription('Pokazuje statystyki bazy'),
    new SlashCommandBuilder().setName('weryfikacja').setDescription('Generuje panel weryfikacji'),
    new SlashCommandBuilder().setName('tickety').setDescription('Generuje panel zgłoszeń klienta'),
    new SlashCommandBuilder().setName('regulamin_setup').setDescription('Generuje regulamin serwera'),
    new SlashCommandBuilder().setName('cennik_setup').setDescription('Generuje cennik usług i produktów'),
    new SlashCommandBuilder().setName('strefapremium').setDescription('Generuje informacje o strefie premium'),
    new SlashCommandBuilder().setName('ankieta').setDescription('Tworzy ankietę dla użytkowników').addStringOption(o => o.setName('pytanie').setDescription('Treść pytania').setRequired(true)),
    new SlashCommandBuilder().setName('konkurs').setDescription('Tworzy szybki konkurs').addStringOption(o => o.setName('nagroda').setDescription('Nagroda').setRequired(true)).addStringOption(o => o.setName('czas').setDescription('Czas trwania (np. 1h, 1d)').setRequired(true)).addStringOption(o => o.setName('opis').setDescription('Zasady').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Banuje użytkownika permanentnie lub czasowo').addUserOption(o => o.setName('uzytkownik').setDescription('Cel').setRequired(true)).addStringOption(o => o.setName('czas').setDescription('Np. permanentny, 7d, 30d').setRequired(true)).addStringOption(o => o.setName('powod').setDescription('Powód kary').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('Wycisza użytkownika (Timeout)').addUserOption(o => o.setName('uzytkownik').setDescription('Cel').setRequired(true)).addStringOption(o => o.setName('czas').setDescription('Format czasu np. 15m, 1h, 7d').setRequired(true)).addStringOption(o => o.setName('powod').setDescription('Powód wyciszenia').setRequired(true))
].map(c => c.toJSON());

// NAPRAWIONO: Zmiana z clientReady na poprawny 'ready'
client.once('ready', async () => {
    console.log(`\x1b[32m[DISCORD] Zalogowano pomyślnie jako: ${client.user.tag}\x1b[0m`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { 
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData }); 
        console.log('\x1b[34m[DISCORD] Rejestracja komend slash zakończona.\x1b[0m');
    } catch (e) { console.error(e); }
    
    app.listen(PORT, () => console.log(`[WWW] Serwer EJS / Dashboard działa na porcie ${PORT}`));
});

// ==========================================
// SYSTEM POWITAŃ I POŻEGNAŃ (Giga Estetyczne)
// ==========================================
client.on('guildMemberAdd', async (member) => {
    const channel = member.guild.channels.cache.get(CHAN_WELCOME);
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setTitle('✨ NOWY UŻYTKOWNIK NA POKŁADZIE! ✨')
        .setDescription(`Witaj **${member.user.username}** na naszym serwerze developerskim!\n\n> 🛡️ Skieruj się na kanał <#${CHAN_VERIFY}> aby odblokować resztę serwera.\n> 📜 Zapoznaj się z <#${CHAN_RULES}> przed dokonaniem jakichkolwiek zakupów.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '👤 Nazwa konta', value: `${member}`, inline: true },
            { name: '🆔 ID Użytkownika', value: `\`${member.id}\``, inline: true },
            { name: '📊 Liczba graczy', value: `\`${member.guild.memberCount}\` użytkowników`, inline: true }
        )
        .setColor('#5865F2')
        .setImage('https://i.imgur.com/8Q5N8pE.png') // Podmień na własny baner jeśli chcesz
        .setTimestamp()
        .setFooter({ text: 'Rajenn Core Systems', iconURL: member.guild.iconURL() });

    channel.send({ content: `Witaj ${member}! 👋`, embeds: [welcomeEmbed] });
});

client.on('guildMemberRemove', async (member) => {
    const channel = member.guild.channels.cache.get(CHAN_WELCOME);
    if (!channel) return;

    const goodbyeEmbed = new EmbedBuilder()
        .setTitle('😢 ODPUŚCIŁ NASZ POKŁAD... 😢')
        .setDescription(`Żegnamy użytkownika **${member.user.username}**. Mamy nadzieję, że kiedyś do nas wrócisz!`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '👤 Kto nas opuścił', value: `${member.user.tag}`, inline: true },
            { name: '📉 Aktualny stan', value: `\`${member.guild.memberCount}\` użytkowników`, inline: true }
        )
        .setColor('#ED4245')
        .setTimestamp()
        .setFooter({ text: 'Rajenn Core Systems', iconURL: member.guild.iconURL() });

    channel.send({ embeds: [goodbyeEmbed] });
});

// ==========================================
// SYSTEM REAKCJI, PRZYCISKÓW I INTERAKCJI
// ==========================================
client.on('interactionCreate', async (interaction) => {
    
    // Obsługa przycisków i weryfikacji
    if (interaction.isButton()) {
        if (interaction.customId === 'weryfikacja_btn') {
            const role = interaction.guild.roles.cache.get(ROLE_VERIFIED);
            if (!role) return interaction.reply({ content: '❌ Konfiguracja ról serwera jest niepoprawna.', ephemeral: true });
            
            try {
                if (interaction.member.roles.cache.has(ROLE_VERIFIED)) {
                    await interaction.reply({ content: 'ℹ️ Twoje konto przeszło już proces weryfikacji.', ephemeral: true });
                } else {
                    await interaction.member.roles.add(role);
                    await interaction.reply({ content: '✅ **Pomyślnie zweryfikowano!** Otrzymałeś dostęp do kanałów tekstowych.', ephemeral: true });
                }
            } catch (err) { 
                await interaction.reply({ content: '❌ Wystąpił błąd podczas nadawania roli weryfikacyjnej.', ephemeral: true }); 
            }
        }

        if (interaction.customId === 'ticket_close_btn') {
            await interaction.reply({ content: '🔒 **Zgłoszenie zostanie zamknięte i usunięte za 5 sekund...**' });
            setTimeout(async () => { try { await interaction.channel.delete(); } catch (e) {} }, 5000);
        }
        return;
    }

    // Obsługa Menu Wyboru w Ticketach
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_select') {
            await interaction.deferReply({ ephemeral: true });
            const selected = interaction.values[0];
            const categoryId = TICKET_CATEGORIES[selected];

            try {
                const channel = await interaction.guild.channels.create({
                    name: `ticket-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    parent: categoryId,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
                        { id: ROLE_OWNER, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                });

                const embed = new EmbedBuilder()
                    .setTitle('🎫 SYSTEM ZGŁOSZEŃ')
                    .setDescription(`Witaj ${interaction.user}!\n\nDziękujemy za otwarcie zgłoszenia w kategorii: **${selected.toUpperCase()}**.\nOpisz jak najdokładniej swoją sprawę, a Właściciel odpowie najszybciej jak to możliwe.\n\n*Możesz również zarządzać tym ticketem bezpośrednio z poziomu panelu WWW bota!*`)
                    .setColor('#5865F2')
                    .setTimestamp();
                
                const closeBtn = new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('Zamknij Zgłoszenie').setStyle(ButtonStyle.Danger).setEmoji('🔒');
                await channel.send({ content: `${interaction.user} | <@&${ROLE_OWNER}>`, embeds: [embed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
                
                await interaction.editReply({ content: `✅ Twój ticket został pomyślnie otwarty: ${channel}` });
            } catch (e) {
                await interaction.editReply({ content: '❌ Nie udało się stworzyć kanału zgłoszenia. Sprawdź uprawnienia bota.' });
            }
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, member } = interaction;
    
    // Sprawdzanie uprawnień i ról (Zgodnie z instrukcjami użytkownika)
    const isOwner = member.roles.cache.has(ROLE_OWNER);
    const isOpiekun = member.roles.cache.has(ROLE_OPIEKUN);

    // Ograniczenia dostępu: Opiekun może tylko ban/mute, reszta blokowana. Inni gracze nie mają dostępu do niczego.
    if (['ban', 'mute'].includes(commandName)) {
        if (!isOwner && !isOpiekun) {
            return interaction.reply({ content: '❌ Brak uprawnień. Ta komenda należy wyłącznie do Administracji (Właściciel/Opiekun).', ephemeral: true });
        }
    } else {
        if (!isOwner) {
            return interaction.reply({ content: '❌ Odmowa dostępu. Tylko **Właściciel** ma prawo zarządzać konfiguracją bota.', ephemeral: true });
        }
    }

    const db = loadData();

    // ==========================================
    // SYSTEM PRACY NA BAZIE + AUTOMATYCZNE OGŁOSZENIA
    // ==========================================
    
    // Funkcja pomocnicza generująca automatyczne powiadomienie
    async function sendRajennAnnouncement(type, name, desc, version) {
        const announceChan = client.channels.cache.get(CHAN_ANNOUNCEMENTS);
        if (!announceChan) return;

        const embed = new EmbedBuilder()
            .setTitle(`🚀 NOWA PUBLIKACJA OD RAJENNA!`)
            .setDescription(`**RajenN** właśnie wdrożył nową pozycję do swojego oficjalnego portfolio!`)
            .addFields(
                { name: '📁 Typ produktu', value: `\`${type.toUpperCase()}\``, inline: true },
                { name: '📦 Nazwa projektu', value: `\`${name}\``, inline: true },
                { name: '⚙️ Wersja/Wymagania', value: `\`${version}\``, inline: true },
                { name: '📝 Krótki opis techniczny', value: `> ${desc}` }
            )
            .setColor('#F1C40F')
            .setTimestamp()
            .setFooter({ text: 'Rajenn Core Portfolio' });

        await announceChan.send({ content: '@everyone 🎉', embeds: [embed] });
    }

    if (commandName === 'dodajplugin') {
        const id = options.getString('id'), name = options.getString('informacje'), desc = options.getString('opis'), ver = options.getString('wersja'), type = options.getString('typ') || 'free', price = options.getString('cena') || 'Brak', link = options.getString('pobierz') || '', youtube = options.getString('youtube') || '';
        if (db.plugins.some(p => p.id === id)) return interaction.reply({ content: `❌ ID \`${id}\` jest już zajęte w bazie pluginów.`, ephemeral: true });
        db.plugins.push({ id, nazwa: name, opis: desc, wersja: ver, typ: type, cena: price, link, youtube, dataDodania: new Date().toLocaleDateString('pl-PL') });
        saveData(db);
        
        await interaction.reply({ content: `✅ Pomyślnie dodano plugin **${name}** do bazy danych.`, ephemeral: true });
        await sendRajennAnnouncement('plugin', name, desc, ver);
    }

    if (commandName === 'dodajpaczke') {
        const id = options.getString('id'), name = options.getString('informacje'), desc = options.getString('opis'), ver = options.getString('wersja'), type = options.getString('typ') || 'free', price = options.getString('cena') || 'Brak', link = options.getString('pobierz') || '', youtube = options.getString('youtube') || '';
        if (db.modpacks.some(p => p.id === id)) return interaction.reply({ content: `❌ ID \`${id}\` jest już zajęte w bazie paczek.`, ephemeral: true });
        db.modpacks.push({ id, nazwa: name, opis: desc, wersja: ver, typ: type, cena: price, link, youtube, dataDodania: new Date().toLocaleDateString('pl-PL') });
        saveData(db);
        
        await interaction.reply({ content: `📦 Pomyślnie dodano paczkę **${name}** do portfolio.`, ephemeral: true });
        await sendRajennAnnouncement('paczka configów', name, desc, ver);
    }

    if (commandName === 'dodajskrypt') {
        const id = options.getString('id'), name = options.getString('informacje'), desc = options.getString('opis'), ver = options.getString('wersja'), type = options.getString('typ') || 'free', price = options.getString('cena') || 'Brak', link = options.getString('pobierz') || '', youtube = options.getString('youtube') || '';
        if (db.scripts.some(s => s.id === id)) return interaction.reply({ content: `❌ ID \`${id}\` jest już zajęte w bazie skryptów.`, ephemeral: true });
        db.scripts.push({ id, nazwa: name, opis: desc, wersja: ver, typ: type, cena: price, link, youtube, dataDodania: new Date().toLocaleDateString('pl-PL') });
        saveData(db);
        
        await interaction.reply({ content: `✅ Pomyślnie dodano skrypt **${name}** do bazy danych.`, ephemeral: true });
        await sendRajennAnnouncement('skrypt (.sk)', name, desc, ver);
    }

    // Usuwanie rekordów z bazy
    if (commandName === 'usunplugin') {
        const id = options.getString('id');
        if (!db.plugins.some(p => p.id === id)) return interaction.reply({ content: `❌ Nie znaleziono pluginu o ID **${id}**.`, ephemeral: true });
        db.plugins = db.plugins.filter(p => p.id !== id); saveData(db);
        await interaction.reply({ content: `🗑️ Usunięto plugin o ID **${id}**.`, ephemeral: true });
    }
    if (commandName === 'usunpaczke') {
        const id = options.getString('id');
        if (!db.modpacks.some(p => p.id === id)) return interaction.reply({ content: `❌ Nie znaleziono paczki o ID **${id}**.`, ephemeral: true });
        db.modpacks = db.modpacks.filter(p => p.id !== id); saveData(db);
        await interaction.reply({ content: `🗑️ Usunięto paczkę o ID **${id}**.`, ephemeral: true });
    }
    if (commandName === 'usunskrypt') {
        const id = options.getString('id');
        if (!db.scripts.some(s => s.id === id)) return interaction.reply({ content: `❌ Nie znaleziono skryptu o ID **${id}**.`, ephemeral: true });
        db.scripts = db.scripts.filter(s => s.id !== id); saveData(db);
        await interaction.reply({ content: `🗑️ Usunięto skrypt o ID **${id}**.`, ephemeral: true });
    }

    if (commandName === 'statystyki') {
        const embed = new EmbedBuilder().setTitle('📊 REPOZYTORIUM RAJENNA').setColor('#F1C40F').addFields({ name: '🔌 Pluginy API', value: `\`${db.plugins.length}\` szt.`, inline: true }, { name: '📦 Paczki i Instancje', value: `\`${db.modpacks.length}\` szt.`, inline: true }, { name: '📜 Skrypty', value: `\`${db.scripts.length}\` szt.`, inline: true }).setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    // ==========================================
    // SEKCJA SETUPÓW I STRUKTUR SERWEROWYCH
    // ==========================================
    if (commandName === 'weryfikacja') {
        const embed = new EmbedBuilder()
            .setTitle('🛡️ CENTRUM WERYFIKACJI UŻYTKOWNIKÓW')
            .setDescription('Witaj na naszym serwerze developerskim!\nAby zapobiec kontom typu bot i uzyskać pełen wgląc w kanały publiczne, oferty oraz cenniki, wymagane jest kliknięcie poniższego przycisku.\n\n**Zasady weryfikacji:**\n* Kliknięcie nadaje natychmiastową rangę dostępową.\n* Brak konieczności wpisywania zewnętrznych kodów.')
            .setColor('#2ECC71')
            .setFooter({ text: 'Zabezpieczenie serwera Rajenn Core' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('weryfikacja_btn').setLabel('Kliknij tutaj aby się zweryfikować').setStyle(ButtonStyle.Success).setEmoji('✅')
        );

        const targetChannel = interaction.guild.channels.cache.get(CHAN_VERIFY);
        if(targetChannel) {
            await targetChannel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: '✅ Panel weryfikacji został wysłany na odpowiedni kanał.', ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ Nie odnaleziono docelowego kanału weryfikacji.', ephemeral: true });
        }
    }

    if (commandName === 'tickety') {
        const embed = new EmbedBuilder()
            .setTitle('🎫 CENTRUM ZGŁOSZEŃ KLIENTA')
            .setDescription('> Masz pytanie, potrzebujesz pomocy technicznej lub chcesz\n> złożyć indywidualne zamówienie na skrypt/plugin? Wybierz odpowiednią kategorię.\n\n**Dostępne działy obsługi:**\n🛒 `Zamówienia` - Kupno gotowych paczek lub własnych systemów\n🛡️ `Pomoc / Pytanie` - Wsparcie techniczne w konfiguracji\n💻 `Błąd w produkcie` - Zgłoszenia bugów\n🤝 `Współpraca` - Propozycje partnerskie\n⭐ `Zakup Strefy Premium` - Uzyskanie natychmiastowego dostępu VIP')
            .setColor('#16A085')
            .setFooter({ text: 'Obsługa zgłoszeń odbywa się w pełni automatycznie.' });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_select')
                .setPlaceholder('Wybierz cel otwarcia zgłoszenia...')
                .addOptions([
                    { label: 'Zamówienia dedykowane', description: 'Złóż zamówienie na plugin/skrypt/paczkę', value: 'zamowienie', emoji: '🛒' },
                    { label: 'Pomoc / Wsparcie', description: 'Potrzebujesz pomocy z konfiguracją', value: 'pomoc', emoji: '🛡️' },
                    { label: 'Zgłoszenie błędu', description: 'Zgłoś znaleziony błąd w kodzie', value: 'blad', emoji: '💻' },
                    { label: 'Współpraca / Partnerstwo', description: 'Napisz ofertę biznesową', value: 'wspolpraca', emoji: '🤝' },
                    { label: 'Dostęp do Strefy Premium', description: 'Kup rangę Premium i zniżki', value: 'premium', emoji: '⭐' }
                ]),
        );
        
        const targetChannel = interaction.guild.channels.cache.get(CHAN_TICKETS);
        if(targetChannel) {
            await targetChannel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: '✅ Panel ticketów został pomyślnie wygenerowany.', ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ Nie odnaleziono docelowego kanału zgłoszeń.', ephemeral: true });
        }
    }

    if (commandName === 'regulamin_setup') {
        const embed = new EmbedBuilder()
            .setTitle('📜 REGULAMIN ZAKUPU PACZEK, PLUGINÓW I SKRYPTÓW')
            .setDescription('Dokonując jakichkolwiek transakcji na serwerze, akceptujesz poniższe warunki licencyjne:')
            .addFields(
                { name: '1. Warunki zakupu i płatności', value: '> [TUTAJ WPISZ SWÓJ WŁASNY TEKST REGULAMINU DOTYCZĄCY METOD PŁATNOŚCI]' },
                { name: '2. Licencja i prawa autorskie', value: '> Zakazuje się dekompilacji kodu źródłowego, odsprzedaży osobom trzecim oraz rozpowszechniania bez pisemnej zgody autora (RajenN).' },
                { name: '3. Zwroty i reklamacje', value: '> Ze względu na cyfrowy charakter produktów, po otrzymaniu plików źródłowych, zwroty środków (refundacje) nie są przyjmowane.' },
                { name: '4. Wsparcie techniczne', value: '> Kupując produkt premium, otrzymujesz dożywotnie poprawki błędów znalezionych w zakupionej wersji.' }
            )
            .setColor('#E67E22')
            .setFooter({ text: 'Złamanie regulaminu wiąże się z odebraniem licencji i banem na serwerze.' });

        const targetChannel = interaction.guild.channels.cache.get(CHAN_RULES);
        if(targetChannel) {
            await targetChannel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Regulamin opublikowany.', ephemeral: true });
        }
    }

    if (commandName === 'cennik_setup') {
        const embed = new EmbedBuilder()
            .setTitle('💳 OFICJALNY CENNIK USŁUG DECOWSKICH')
            .setDescription('Poniżej znajdują się orientacyjne stawki za realizację projektów. Dokładna cena ustalana jest indywidualnie w ticketach.')
            .addFields(
                { name: '🔌 Dedykowane Pluginy Java', value: '└ Stawka od: **50 PLN**\n└ [TUTAJ WPISZ DODATKOWY TEKST DO CENNIKA PLUGINÓW]', inline: false },
                { name: '📜 Autorskie Skrypty (.sk)', value: '└ Stawka od: **25 PLN**\n└ [TUTAJ WPISZ DODATKOWY TEKST DO CENNIKA SKRYPTÓW]', inline: false },
                { name: '📦 Kompletne Paczki Serwerowe', value: '└ Stawka od: **100 PLN**\n└ [TUTAJ WPISZ DODATKOWY TEKST DO CENNIKA PACZEK]', inline: false }
            )
            .setColor('#2ECC71')
            .setFooter({ text: 'Cennik ma charakter poglądowy i zależy od poziomu skomplikowania kodu.' });

        const targetChannel = interaction.guild.channels.cache.get(CHAN_CENNIK);
        if(targetChannel) {
            await targetChannel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Cennik opublikowany.', ephemeral: true });
        }
    }

    if (commandName === 'strefapremium') {
        const embed = new EmbedBuilder()
            .setTitle('👑 PRZYWILEJE STREFY PREMIUM')
            .setDescription('Strefa Premium dedykowana jest dla stałych klientów oraz osób wspierających rozwój projektów.')
            .addFields(
                { name: '🎁 Co zyskujesz?', value: '• Stały rabat **-20%** na każde kolejne zamówienie skryptów i pluginów.\n• Dostęp do tajnego kanału wydań testowych wersji Beta.\n• Priorytetowe traktowanie Twoich zgłoszeń w ticketach.' },
                { name: '💎 Jak dołączyć?', value: '> Otwórz ticket w kategorii **Zakup Strefy Premium** i sfinalizuj transakcję u Właściciela.' }
            )
            .setColor('#9B59B6');

        const targetChannel = interaction.guild.channels.cache.get(CHAN_PREMIUM);
        if(targetChannel) {
            await targetChannel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Panel strefy premium został wygenerowany.', ephemeral: true });
        }
    }

    if (commandName === 'ankieta') {
        const q = options.getString('pytanie');
        const embed = new EmbedBuilder().setTitle('📊 OFICJALNA ANKIETA SERWEROWA').setDescription(`**Pytanie:**\n> ${q}`).setColor('#3498DB').setTimestamp();
        await interaction.reply({ content: 'Opublikowano ankietę.', ephemeral: true });
        const msg = await interaction.channel.send({ embeds: [embed] });
        await msg.react('👍'); await msg.react('👎');
    }

    if (commandName === 'konkurs') {
        const prize = options.getString('nagroda'), time = options.getString('czas'), desc = options.getString('opis');
        const embed = new EmbedBuilder().setTitle('🎉 NOWY KONKURS / GIVEAWAY! 🎉').addFields({ name: '🎁 Nagroda do zgarnięcia', value: `**${prize}**` }, { name: '⏳ Czas trwania', value: `\`${time}\`` }, { name: '📜 Warunki i zasady', value: desc }).setColor('#E74C3C');
        
        const targetChannel = interaction.guild.channels.cache.get(CHAN_GIVEAWAYS);
        if(targetChannel) {
            const msg = await targetChannel.send({ content: '@everyone 🔥', embeds: [embed] });
            await msg.react('🎉');
            await interaction.reply({ content: '✅ Konkurs wystartował pomyślnie!', ephemeral: true });
        }
    }

    // ==========================================
    // SEKCJA ZAAWANSOWANEJ MODERACJI (Właściciel / Opiekun)
    // ==========================================
    if (commandName === 'ban') {
        const target = options.getUser('uzytkownik');
        const duration = options.getString('czas');
        const reason = options.getString('powod');
        
        try {
            await interaction.guild.members.ban(target, { reason: `Czas kary: ${duration} | Powód: ${reason}` });
            await interaction.reply({ content: `✅ Pomyślnie zbanowano użytkownika **${target.tag}**.\n**Czas:** ${duration}\n**Powód:** ${reason}` });
        } catch (e) { 
            await interaction.reply({ content: '❌ Wystąpił błąd podczas nakładania blokady. Sprawdź pozycję ról bota.', ephemeral: true }); 
        }
    }

    if (commandName === 'mute') {
        const target = options.getUser('uzytkownik');
        const durationStr = options.getString('czas');
        const reason = options.getString('powod');
        
        const msDuration = ms(durationStr);
        if (!msDuration) return interaction.reply({ content: '❌ Podano błędny format czasu! Poprawny przykład: `15m`, `1h`, `2d`.', ephemeral: true });
        
        try {
            const memberTarget = await interaction.guild.members.fetch(target.id);
            await memberTarget.timeout(msDuration, reason);
            await interaction.reply({ content: `✅ Wyciszono użytkownika **${target.tag}** na czas \`${durationStr}\`.\n**Powód:** ${reason}` });
        } catch (e) { 
            await interaction.reply({ content: '❌ Nie udało się nałożyć wyciszenia. Upewnij się, że użytkownik nie posiada wyższej roli od bota.', ephemeral: true }); 
        }
    }
});

client.login(TOKEN);