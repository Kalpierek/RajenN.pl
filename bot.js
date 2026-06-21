require('dotenv').config(); 
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Próba zaimportowania basic-ftp
let ftp;
try {
    ftp = require('basic-ftp');
} catch (e) {
    console.warn("⚠️ Brak pakietu basic-ftp. Synchronizacja FTP będzie nieaktywna dopóki nie uruchomisz 'npm install'.");
}

const TOKEN = process.env.DISCORD_TOKEN; 
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

if (!TOKEN) {
    console.error("❌ BŁĄD: Brak tokenu! Upewnij się, że masz plik .env z wpisanym DISCORD_TOKEN.");
    process.exit(1);
}

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

function loadData() {
    let structure = { modpacks: [], plugins: [], scripts: [] };
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(structure, null, 4), 'utf8');
        return structure;
    }
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (!data.modpacks) data.modpacks = [];
        if (!data.plugins) data.plugins = [];
        if (!data.scripts) data.scripts = [];
        return data;
    } catch (e) {
        return structure;
    }
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4), 'utf8');
    
    // Backup
    try {
        const backupPath = path.join(BACKUP_DIR, `data_backup_${Date.now()}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(data, null, 4), 'utf8');
        
        // Czyszczenie starych backupów (trzymamy max 5)
        const backups = fs.readdirSync(BACKUP_DIR)
            .map(file => ({ name: file, time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time);
        
        if (backups.length > 5) {
            for (let i = 5; i < backups.length; i++) {
                fs.unlinkSync(path.join(BACKUP_DIR, backups[i].name));
            }
        }
    } catch (err) {
        console.error("⚠️ Błąd tworzenia backupu:", err);
    }
}

// Ulepszona funkcja synchronizacji zwracająca wyniki dla Discorda
async function syncToHosting() {
    let results = [];
    
    // 1. FTP Upload
    const ftpHost = process.env.FTP_HOST;
    const ftpUser = process.env.FTP_USER;
    const ftpPass = process.env.FTP_PASS;
    const ftpPath = process.env.FTP_PATH || '/';

    if (ftpHost && ftpUser && ftpPass) {
        if (!ftp) {
            results.push("❌ **FTP:** Brak biblioteki `basic-ftp` (uruchom `npm install` w konsoli bota).");
        } else {
            const ftpClient = new ftp.Client();
            ftpClient.ftp.verbose = false;
            try {
                await ftpClient.access({
                    host: ftpHost,
                    user: ftpUser,
                    password: ftpPass,
                    secure: false
                });
                
                let targetPath = 'data.json';
                if (ftpPath) {
                    const cleanPath = ftpPath.endsWith('/') ? ftpPath : ftpPath + '/';
                    targetPath = cleanPath + 'data.json';
                }
                
                await ftpClient.uploadFrom(DATA_FILE, targetPath);
                results.push(`✅ **FTP:** Pomyślnie zsynchronizowano i wysłano \`data.json\` do \`${targetPath}\`!`);
            } catch (err) {
                results.push(`❌ **FTP:** Błąd wysyłania: \`${err.message}\``);
            } finally {
                ftpClient.close();
            }
        }
    }

    // 2. GitHub API Upload
    const ghToken = process.env.GH_TOKEN;
    const ghRepo = process.env.GH_REPO;
    const ghBranch = process.env.GH_BRANCH || 'main';
    const ghPath = process.env.GH_PATH || 'data.json';

    if (ghToken && ghRepo) {
        try {
            const syncRes = await new Promise((resolve) => {
                const base64Content = fs.readFileSync(DATA_FILE).toString('base64');
                const authHeader = `token ${ghToken}`;
                const userAgent = 'RajennBot';

                // Krok 1: Pobranie SHA pliku (żeby zaktualizować)
                const getOptions = {
                    hostname: 'api.github.com',
                    path: `/repos/${ghRepo}/contents/${ghPath}?ref=${ghBranch}`,
                    method: 'GET',
                    headers: {
                        'Authorization': authHeader,
                        'User-Agent': userAgent,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                };

                const reqGet = https.request(getOptions, (res) => {
                    let body = '';
                    res.on('data', (chunk) => body += chunk);
                    res.on('end', () => {
                        let sha = null;
                        if (res.statusCode === 200) {
                            try {
                                sha = JSON.parse(body).sha;
                            } catch (e) {}
                        }

                        // Krok 2: Wysłanie nowego pliku
                        const putBody = JSON.stringify({
                            message: `bot: automatyczna aktualizacja danych (${ghPath})`,
                            content: base64Content,
                            sha: sha || undefined,
                            branch: ghBranch
                        });

                        const putOptions = {
                            hostname: 'api.github.com',
                            path: `/repos/${ghRepo}/contents/${ghPath}`,
                            method: 'PUT',
                            headers: {
                                'Authorization': authHeader,
                                'User-Agent': userAgent,
                                'Accept': 'application/vnd.github.v3+json',
                                'Content-Type': 'application/json',
                                'Content-Length': Buffer.byteLength(putBody)
                            }
                        };

                        const reqPut = https.request(putOptions, (resPut) => {
                            let putBodyResponse = '';
                            resPut.on('data', (chunk) => putBodyResponse += chunk);
                            resPut.on('end', () => {
                                if (resPut.statusCode === 200 || resPut.statusCode === 201) {
                                    resolve(`✅ **GitHub:** Pomyślnie zaktualizowano repozytorium \`${ghRepo}\` (${ghPath})!`);
                                } else {
                                    resolve(`❌ **GitHub:** Błąd zapisu (Status ${resPut.statusCode})`);
                                }
                            });
                        });

                        reqPut.on('error', (e) => resolve(`❌ **GitHub:** Błąd sieci PUT: \`${e.message}\``));
                        reqPut.write(putBody);
                        reqPut.end();
                    });
                });

                reqGet.on('error', (e) => resolve(`❌ **GitHub:** Błąd sieci GET: \`${e.message}\``));
                reqGet.end();
            });
            results.push(syncRes);
        } catch (e) {
            results.push(`❌ **GitHub:** Krytyczny błąd: \`${e.message}\``);
        }
    }

    return results;
}

// Funkcja logowania zdarzeń na Discordzie
async function logToDiscord(embed) {
    const channelId = process.env.DISCORD_LOG_CHANNEL_ID;
    if (!channelId) return;
    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error("⚠️ Błąd logowania na kanał Discord:", err.message);
    }
}

app.get('/api/data', (req, res) => {
    try {
        const data = loadData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Fallback dla Express
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🌐 Serwer Express uruchomiony lokalnie na porcie: ${PORT}`);
});

// Komendy Discord
const commands = [
    // 1. Plugin commands
    new SlashCommandBuilder()
        .setName('dodajplugin')
        .setDescription('Dodaje nowy plugin do bazy danych')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('nazwa').setDescription('Nazwa pluginu').setRequired(true))
        .addStringOption(opt => opt.setName('opis').setDescription('Opis działania / funkcjonalności').setRequired(true))
        .addStringOption(opt => opt.setName('wersja').setDescription('Kompatybilne wersje (np. 1.20 - 1.21)').setRequired(true))
        .addStringOption(opt => opt.setName('numerek').setDescription('Unikalny numer / ID pluginu').setRequired(true))
        .addStringOption(opt => opt.setName('typ').setDescription('Darmowy czy Premium').setRequired(false)
            .addChoices({ name: 'Darmowy (FREE)', value: 'free' }, { name: 'Premium', value: 'premium' }))
        .addStringOption(opt => opt.setName('cena').setDescription('Cena pluginu (np. 15 PLN)').setRequired(false))
        .addStringOption(opt => opt.setName('link').setDescription('Link do instalacji / pobrania').setRequired(false))
        .addStringOption(opt => opt.setName('permisje').setDescription('Lista uprawnień').setRequired(false)),

    new SlashCommandBuilder()
        .setName('usunplugin')
        .setDescription('Usuwa plugin z bazy na podstawie numerka')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('numerek').setDescription('Numer / ID pluginu do usunięcia').setRequired(true)),

    // 2. Modpack (Paczka) commands
    new SlashCommandBuilder()
        .setName('dodajpaczke')
        .setDescription('Dodaje nową paczkę do portfolio')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('nazwa').setDescription('Nazwa projektu / paczki').setRequired(true))
        .addStringOption(opt => opt.setName('opis').setDescription('Opis paczki modyfikacji').setRequired(true))
        .addStringOption(opt => opt.setName('wersja').setDescription('Wersja gry (np. 1.21.1)').setRequired(true))
        .addStringOption(opt => opt.setName('numerek').setDescription('Unikalny numer / ID paczki').setRequired(true)),

    new SlashCommandBuilder()
        .setName('usunpaczke')
        .setDescription('Usuwa paczkę z portfolio na podstawie numerka')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('numerek').setDescription('Numer / ID paczki do usunięcia').setRequired(true)),

    // 3. Script (Skrypt) commands
    new SlashCommandBuilder()
        .setName('dodajskrypt')
        .setDescription('Dodaje nowy skrypt do bazy danych')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('nazwa').setDescription('Nazwa skryptu').setRequired(true))
        .addStringOption(opt => opt.setName('opis').setDescription('Opis działania skryptu').setRequired(true))
        .addStringOption(opt => opt.setName('wersja').setDescription('Wersja / Wymagania (np. Skript 2.9)').setRequired(true))
        .addStringOption(opt => opt.setName('numerek').setDescription('Unikalny numer / ID skryptu').setRequired(true))
        .addStringOption(opt => opt.setName('typ').setDescription('Darmowy czy Premium').setRequired(false)
            .addChoices({ name: 'Darmowy (FREE)', value: 'free' }, { name: 'Premium', value: 'premium' }))
        .addStringOption(opt => opt.setName('cena').setDescription('Cena skryptu (np. 10 PLN)').setRequired(false))
        .addStringOption(opt => opt.setName('link').setDescription('Link do pobrania').setRequired(false)),

    new SlashCommandBuilder()
        .setName('usunskrypt')
        .setDescription('Usuwa skrypt z bazy na podstawie numerka')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('numerek').setDescription('Numer / ID skryptu do usunięcia').setRequired(true)),

    // 4. Info command
    new SlashCommandBuilder()
        .setName('statystyki')
        .setDescription('Wyświetla aktualne statystyki bazy danych strony')
].map(command => command.toJSON());

// Poprawny event: 'ready'
client.once('ready', async () => {
    console.log(`🤖 Bot zalogowany jako: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Komendy Discord załadowane pomyślnie!');
    } catch (error) {
        console.error('❌ Błąd rejestracji komend:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const db = loadData();
    const { commandName, options } = interaction;

    // Pomocniczy generator statusu synchro
    const getFinalResponse = (baseMsg, syncResults) => {
        let finalMsg = baseMsg;
        if (syncResults.length > 0) {
            finalMsg += `\n\n**🔄 Status synchronizacji:**\n` + syncResults.join('\n');
        } else {
            finalMsg += `\n\n⚠️ **Uwaga: Brak konfiguracji darmowego hostingu w `.env`!**\nNie uzupełniłeś danych FTP ani tokenu GitHub w pliku \`.env\` bota. Paczka/Zasób zostały zapisane **tylko lokalnie** na Twoim komputerze i nie pojawią się na Twojej darmowej stronie w internecie dopóki tego nie skonfigurujesz.`;
        }
        return finalMsg;
    };

    // --- DODAJ PLUGIN ---
    if (commandName === 'dodajplugin') {
        await interaction.deferReply();
        const id = options.getString('numerek');
        const nazwa = options.getString('nazwa');
        const opis = options.getString('opis');
        const wersja = options.getString('wersja');
        const typ = options.getString('typ') || 'free';
        const cena = options.getString('cena') || 'Brak';
        const link = options.getString('link') || '';
        const permisje = options.getString('permisje') || 'Brak specyfikacji';

        if (db.plugins.some(p => p.id === id)) {
            await interaction.editReply(`❌ Błąd: Plugin z numerkiem **${id}** już istnieje!`);
            return;
        }

        const nowyPlugin = {
            id,
            nazwa,
            opis,
            wersja,
            typ,
            cena,
            link,
            permisje,
            dataDodania: new Date().toLocaleDateString('pl-PL')
        };

        db.plugins.push(nowyPlugin);
        saveData(db);
        
        // Wykonanie i odczytanie wyników synchronizacji
        const syncResults = await syncToHosting();

        const embed = new EmbedBuilder()
            .setTitle('🔌 Dodano nowy plugin')
            .setDescription(`Nowy plugin pojawił się na stronie!`)
            .setColor('#2ecc71')
            .addFields(
                { name: 'Nazwa', value: nazwa, inline: true },
                { name: 'ID (Numerek)', value: id, inline: true },
                { name: 'Wersja', value: wersja, inline: true },
                { name: 'Typ', value: typ.toUpperCase(), inline: true },
                { name: 'Cena', value: cena, inline: true },
                { name: 'Opis', value: opis }
            )
            .setTimestamp();

        await logToDiscord(embed);
        
        const finalMsg = getFinalResponse(`✅ Dodano nowy plugin: **${nazwa}** (ID: ${id})`, syncResults);
        await interaction.editReply(finalMsg);
    }

    // --- USUN PLUGIN ---
    if (commandName === 'usunplugin') {
        await interaction.deferReply();
        const id = options.getString('numerek');
        const plugin = db.plugins.find(p => p.id === id);

        if (!plugin) {
            await interaction.editReply(`❌ Nie znaleziono pluginu o ID: **${id}**.`);
            return;
        }

        db.plugins = db.plugins.filter(p => p.id !== id);
        saveData(db);
        
        const syncResults = await syncToHosting();

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Usunięto plugin')
            .setDescription(`Plugin został usunięty ze strony.`)
            .setColor('#e74c3c')
            .addFields(
                { name: 'Nazwa', value: plugin.nazwa, inline: true },
                { name: 'ID (Numerek)', value: id, inline: true }
            )
            .setTimestamp();

        await logToDiscord(embed);
        
        const finalMsg = getFinalResponse(`🗑️ Usunięto plugin **${plugin.nazwa}** (ID: ${id}).`, syncResults);
        await interaction.editReply(finalMsg);
    }

    // --- DODAJ PACZKE ---
    if (commandName === 'dodajpaczke') {
        await interaction.deferReply();
        const id = options.getString('numerek');
        const nazwa = options.getString('nazwa');
        const opis = options.getString('opis');
        const wersja = options.getString('wersja');

        if (db.modpacks.some(p => p.id === id)) {
            await interaction.editReply(`❌ Błąd: Paczka z numerkiem **${id}** już istnieje!`);
            return;
        }

        const nowaPaczka = {
            id,
            nazwa,
            opis,
            wersja,
            dataDodania: new Date().toLocaleDateString('pl-PL')
        };

        db.modpacks.push(nowaPaczka);
        saveData(db);
        
        const syncResults = await syncToHosting();

        const embed = new EmbedBuilder()
            .setTitle('📦 Dodano nową paczkę')
            .setDescription(`Nowa paczka modów w portfolio!`)
            .setColor('#3498db')
            .addFields(
                { name: 'Nazwa', value: nazwa, inline: true },
                { name: 'ID (Numerek)', value: id, inline: true },
                { name: 'Wersja', value: wersja, inline: true },
                { name: 'Opis', value: opis }
            )
            .setTimestamp();

        await logToDiscord(embed);
        
        const finalMsg = getFinalResponse(`📦 Dodano nową paczkę: **${nazwa}** (ID: ${id})`, syncResults);
        await interaction.editReply(finalMsg);
    }

    // --- USUN PACZKE ---
    if (commandName === 'usunpaczke') {
        await interaction.deferReply();
        const id = options.getString('numerek');
        const paczka = db.modpacks.find(p => p.id === id);

        if (!paczka) {
            await interaction.editReply(`❌ Nie znaleziono paczki o ID: **${id}**.`);
            return;
        }

        db.modpacks = db.modpacks.filter(p => p.id !== id);
        saveData(db);
        
        const syncResults = await syncToHosting();

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Usunięto paczkę')
            .setDescription(`Paczka została usunięta ze strony.`)
            .setColor('#e74c3c')
            .addFields(
                { name: 'Nazwa', value: paczka.nazwa, inline: true },
                { name: 'ID (Numerek)', value: id, inline: true }
            )
            .setTimestamp();

        await logToDiscord(embed);
        
        const finalMsg = getFinalResponse(`🗑️ Usunięto paczkę **${paczka.nazwa}** (ID: ${id}).`, syncResults);
        await interaction.editReply(finalMsg);
    }

    // --- DODAJ SKRYPT ---
    if (commandName === 'dodajskrypt') {
        await interaction.deferReply();
        const id = options.getString('numerek');
        const nazwa = options.getString('nazwa');
        const opis = options.getString('opis');
        const wersja = options.getString('wersja');
        const typ = options.getString('typ') || 'free';
        const cena = options.getString('cena') || 'Brak';
        const link = options.getString('link') || '';

        if (db.scripts.some(s => s.id === id)) {
            await interaction.editReply(`❌ Błąd: Skrypt z numerkiem **${id}** już istnieje!`);
            return;
        }

        const nowySkrypt = {
            id,
            nazwa,
            opis,
            wersja,
            typ,
            cena,
            link,
            dataDodania: new Date().toLocaleDateString('pl-PL')
        };

        db.scripts.push(nowySkrypt);
        saveData(db);
        
        const syncResults = await syncToHosting();

        const embed = new EmbedBuilder()
            .setTitle('📜 Dodano nowy skrypt')
            .setDescription(`Nowy skrypt pojawił się na stronie!`)
            .setColor('#9b59b6')
            .addFields(
                { name: 'Nazwa', value: nazwa, inline: true },
                { name: 'ID (Numerek)', value: id, inline: true },
                { name: 'Wymagania', value: wersja, inline: true },
                { name: 'Typ', value: typ.toUpperCase(), inline: true },
                { name: 'Cena', value: cena, inline: true },
                { name: 'Opis', value: opis }
            )
            .setTimestamp();

        await logToDiscord(embed);
        
        const finalMsg = getFinalResponse(`✅ Dodano nowy skrypt: **${nazwa}** (ID: ${id})`, syncResults);
        await interaction.editReply(finalMsg);
    }

    // --- USUN SKRYPT ---
    if (commandName === 'usunskrypt') {
        await interaction.deferReply();
        const id = options.getString('numerek');
        const skrypt = db.scripts.find(s => s.id === id);

        if (!skrypt) {
            await interaction.editReply(`❌ Nie znaleziono skryptu o ID: **${id}**.`);
            return;
        }

        db.scripts = db.scripts.filter(s => s.id !== id);
        saveData(db);
        
        const syncResults = await syncToHosting();

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Usunięto skrypt')
            .setDescription(`Skrypt został usunięty ze strony.`)
            .setColor('#e74c3c')
            .addFields(
                { name: 'Nazwa', value: skrypt.nazwa, inline: true },
                { name: 'ID (Numerek)', value: id, inline: true }
            )
            .setTimestamp();

        await logToDiscord(embed);
        
        const finalMsg = getFinalResponse(`🗑️ Usunięto skrypt **${skrypt.nazwa}** (ID: ${id}).`, syncResults);
        await interaction.editReply(finalMsg);
    }

    // --- STATYSTYKI ---
    if (commandName === 'statystyki') {
        const pCount = db.plugins.length;
        const mCount = db.modpacks.length;
        const sCount = db.scripts.length;

        const embed = new EmbedBuilder()
            .setTitle('📊 Statystyki bazy danych')
            .setColor('#f1c40f')
            .addFields(
                { name: '🔌 Pluginy', value: `${pCount}`, inline: true },
                { name: '📦 Paczki modów', value: `${mCount}`, inline: true },
                { name: '📜 Skrypty', value: `${sCount}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
});

client.login(TOKEN);