const { Client, Collection, MessageEmbed, MessageActionRow, MessageButton } = require("discord.js");
const config = require("./config.json");
const db = require("quick.db");
const Fs = require('fs');
const fs = require('node:fs');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const colors = require("colors");
const fetch = require('node-fetch');
const wait = require('node:timers/promises').setTimeout;
const ms = require('ms');

// ----------------------------------| Creating a new Client:
const client = new Client({
    intents: 32767,
});

// ----------------------------------| Defines discord-modals package:
const discordModals = require('discord-modals');
discordModals(client);

module.exports = client;

// ----------------------------------| Creating Colections:
client.commands = new Collection();
client.slashCommands = new Collection();
client.categories = fs.readdirSync('./commands/');
client.snipes = new Map();
client.config = require("./config.json");

require("./handler")(client);

// ----------------------------------| Cool looking console messages:
console.log("———————————————————————————————————————————————————————————————")
console.log("- RP-Template CMD Handler".underline.green + " Loading commands...".brightYellow.italic)
console.log("———————————————————————————————————————————————————————————————")
console.log("[WARN] If your bot isn't coming online, try to run the command 'kill 1' in shell.\n".bold.red)

// ----------------------------------| Slash Cmds:
const commands = [];
const commandFiles = fs.readdirSync('./slashCommands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./slashCommands/${file}`);
    commands.push(command.data.toJSON());
  client.slashCommands.set(command.data.name, command);
}

const rest = new REST({ version: '9' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('[SLASH-HANDLER] Started refreshing application (/) commands...'.bold.brightYellow);

    await rest.put(
            Routes.applicationGuildCommands(config.users.client_id, config.guilds.guild_id),
            { body: commands },
        )

        console.log('[SLASH-HANDLER] Reloaded and Registered (/) Succesfully!'.bold.brightGreen);
    } catch (error) {
        console.error(error);
    }
})();

// ----------------------------------| Snipe command system:
client.on("messageDelete", async (message) => {
  client.snipes.set(message.channel.id,{
    content : message.content,
    author: message.author,
    image: message.attachments.first() ? message.attachments.first().proxyURL : null
  })
});

// ----------------------------------| Ranking System:
const Levels = require("discord-xp");
Levels.setURL(process.env.MONGO);

client.on("messageCreate", async message => {
  const ch = db.fetch(`rank_system_${message.guild.id}`);
  
  if(ch === null) return;
  if(ch == false) return;  
  
  if (message.author.bot) return;
  if (!message.guild) return;

  const randomXp = Math.floor(Math.random() * 98) + 1;
  const level = await Levels.appendXp(
    message.author.id,
    message.guild.id,
    randomXp
  );
  
  if (level) {
    const user = await Levels.fetch(message.author.id, message.guild.id);
    message.channel.send(`⚡ [*LEVEL-UP*] **Congratulations,** ${message.author}! You just leveled up to **level ${user.level}**!`)
  }
})

// ----------------------------------| Auto Moderation System:
client.on("guildMemberAdd", async (member) => {
  let UserJSON = JSON.parse(Fs.readFileSync("./database/users.json"));
  UserJSON[member.id] = {
    warns: 0
  }
  Fs.writeFileSync("./database/users.json", JSON.stringify(UserJSON));
})

let badWords = require("./config/badwords.json")

// Bannable racist words (replace with actual words as needed)
const racistWords = [
  "nigga", // Replace with actual words to ban
  "yn",
  "nigger"
];
client.on("messageCreate", async message => {
  // Bannable racist words check
  if (
    !message.author.bot &&
    !message.member.permissions.has("ADMINISTRATOR")
  ) {
    const content = message.content.toLowerCase();
    for (const word of racistWords) {
      if (content.includes(word)) {
        try {
          // DM the user before banning
          await message.author.send(
            `You have been banned from **${message.guild.name}** for using racist language. If you believe this is a mistake, please contact the server staff.`
          );
        } catch (err) {
          // User's DMs might be closed
        }
        try {
          await message.member.ban({ reason: "Bannable offense: Racist language" });
          message.channel.send(`${message.author} has been **banned** for using racist language.`);
        } catch (err) {
          console.log("[ERR] Failed to ban user for racist language:", err);
        }
        // Delete the offending message after 5 seconds
        setTimeout(() => {
          message.delete().catch(() => {});
        }, 5000);
        return; // Stop further processing
      }
    }
  }


  let UserJSON = JSON.parse(Fs.readFileSync("./database/users.json"));

  if (!UserJSON[message.author.id]) {
    if (message.author.bot) return;
    UserJSON[message.author.id] = {
      warns: 0
    }
    Fs.writeFileSync("./database/users.json", JSON.stringify(UserJSON));
  }
  for (let i = 0; i < badWords.length; i++) {

    const automodCheck = db.fetch(`automod_system_${message.guild.id}`)

    if(automodCheck == true) {

      if (message.member.permissions.has("ADMINISTRATOR")) return;
    
      if (message.content.toLowerCase().includes(badWords[i])) {
    
      message.channel.send(`${message.author}, **Watch your language!** Continuing with 3 total infractions will ends in a mute.`).then(async (msg) => {
        await wait(5000);
        msg.delete();
      })

      message.delete().catch(() => { });

      UserJSON[message.author.id].warns += 1;
      Fs.writeFileSync("./database/users.json", JSON.stringify(UserJSON));

      try {
        
        if (UserJSON[message.author.id].warns === 3) {
   
        (Fs.readFileSync("./database/users.json"));
    
        UserJSON[message.author.id].warns = 0;
    
        Fs.writeFileSync("./database/users.json", JSON.stringify(UserJSON));

        const user = message.member

        const time = config.systems.automod.mute_time;

        if(!time) return;

        const milliseconds = ms(time);
        
        const iosTime = new Date(Date.now() + milliseconds).toISOString();

        try {

          await fetch(`https://discord.com/api/guilds/${message.guild.id}/members/${user.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ communication_disabled_until: iosTime }),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bot ${client.token}`,
            },
          });

        } catch (err) {
          console.log("[ERR] ", err)
        }
      
        const embedMuted = new MessageEmbed()
          .setDescription(`${config.emojis.success} ${user} has been **muted** for **Continuous Infractions.**`)
          .setFooter("Auto Moderation System")
          .setTimestamp()
          .setColor(config.messages.embeds.colors.yes);

        message.channel.send({ embeds: [embedMuted] }).catch(() => { });
    
        }
      } catch (err) {
        console.log(err)
      }
    }
  } else {
      return;
  }
}})

// ----------------------------------| Giveaways manager:
const { GiveawaysManager } = require("discord-giveaways");

client.giveawaysManager = new GiveawaysManager(client, {
  storage: "./database/giveaways.json",
  default: {
    botsCanWin: false,
    embedColor: "#2F3136",
    updateCountdownEvery: 1000,
    reaction: "🎉",
    lastChance: {
      enabled: true,
      content: `🛑 **Last chance to enter!** 🛑`,
      threshold: 5000,
      embedColor: '#FF0000'
    }
  }
});


// ====== ADVANCED MODMAIL SYSTEM WITH BUTTONS ======
const MODMAIL_CATEGORY_ID = "YOUR_CATEGORY_ID"; // Set your modmail category ID here
const STAFF_ROLE_ID = "YOUR_STAFF_ROLE_ID"; // Set your staff role ID here
const MODMAIL_LOG_CHANNEL_ID = "YOUR_LOG_CHANNEL_ID"; // Optional: for logging modmail events

function formatTimestamp(date = new Date()) {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

// Store ticket types for users in memory (for simplicity)
const userTicketType = new Map();

client.on("messageCreate", async message => {
  // Only handle DMs to bot for ticket creation
  if (message.channel.type === "DM" && !message.author.bot) {
    // If user hasn't selected a ticket type, ask for it with buttons
    if (!userTicketType.has(message.author.id)) {
      const row = new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId('ticket_member_report')
          .setLabel('Member Report')
          .setStyle('PRIMARY'),
        new MessageButton()
          .setCustomId('ticket_high_rank_support')
          .setLabel('High Rank Support')
          .setStyle('SUCCESS'),
        new MessageButton()
          .setCustomId('ticket_community_support')
          .setLabel('Community Support')
          .setStyle('SECONDARY')
      );
      await message.reply({
        content: "**What type of ticket do you want to open?**\nPlease select one of the options below:",
        components: [row]
      });
      return;
    }

    // Continue with modmail creation as before, but include ticket type
    const ticketType = userTicketType.get(message.author.id);
    const guild = client.guilds.cache.get(config.guilds.guild_id);
    if (!guild) return;

    let modmailChannel = guild.channels.cache.find(
      ch => ch.name === `modmail-${message.author.id}` && ch.parentId === MODMAIL_CATEGORY_ID
    );

    if (!modmailChannel) {
      modmailChannel = await guild.channels.create({
        name: `modmail-${message.author.id}`,
        type: 0, // GUILD_TEXT
        parent: MODMAIL_CATEGORY_ID,
        topic: `Modmail thread for ${message.author.tag} (${message.author.id}) | Type: ${ticketType}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: ["ViewChannel"]
          },
          {
            id: STAFF_ROLE_ID,
            allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles"]
          }
        ]
      });
      if (MODMAIL_LOG_CHANNEL_ID) {
        const logChannel = guild.channels.cache.get(MODMAIL_LOG_CHANNEL_ID);
        if (logChannel) {
          logChannel.send(`> 📬|  New modmail opened by **${message.author.tag}** (\`${message.author.id}\`) at ${formatTimestamp()} | **Type:** ${ticketType}`);
        }
      }
      modmailChannel.send({
        embeds: [
          new MessageEmbed()
            .setTitle("📬 New Modmail Opened")
            .setDescription(
              `User: **${message.author.tag}** (\`${message.author.id}\`)\n` +
              `Type: **${ticketType}**\n` +
              `Opened: ${formatTimestamp()}`
            )
            .setColor("BLUE")
            .setFooter({ text: "Use !close to close this thread." })
        ]
      });
    }

    // Forward the user's message to the modmail channel
    modmailChannel.send({
      embeds: [
        new MessageEmbed()
          .setAuthor({ name: `${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
          .setDescription(message.content || "*No text content*")
          .setColor("AQUA")
          .setTimestamp()
      ],
      files: message.attachments.map(a => a.url)
    });

    // Confirm to user
    message.reply("✅ Your message has been sent to the staff team. They will reply to you here. To close this thread, type `!close`.");

    // Remove ticket type after thread is created
    userTicketType.delete(message.author.id);
    return;
  }

  // Staff reply in modmail channel
  if (
    message.guild &&
    message.channel.name.startsWith("modmail-") &&
    !message.author.bot &&
    message.member.roles.cache.has(STAFF_ROLE_ID)
  ) {
    const userId = message.channel.name.split("modmail-")[1];
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) {
      // Forward staff reply to user
      user.send({
        embeds: [
          new MessageEmbed()
            .setAuthor({ name: `Staff Reply from ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setDescription(message.content || "*No text content*")
            .setColor("GREEN")
            .setTimestamp()
        ],
        files: message.attachments.map(a => a.url)
      }).catch(() => {});
    }
  }

  // Modmail close command (user or staff)
  if (
    (message.channel.type === "DM" && message.content.trim().toLowerCase() === "!close") ||
    (message.guild && message.channel.name.startsWith("modmail-") && message.content.trim().toLowerCase() === "!close")
  ) {
    let userId;
    let modmailChannel;
    if (message.channel.type === "DM") {
      userId = message.author.id;
      const guild = client.guilds.cache.get(config.guilds.guild_id);
      if (!guild) return;
      modmailChannel = guild.channels.cache.find(
        ch => ch.name === `modmail-${userId}` && ch.parentId === MODMAIL_CATEGORY_ID
      );
    } else {
      userId = message.channel.name.split("modmail-")[1];
      modmailChannel = message.channel;
    }
    if (modmailChannel) {
      // Notify user and staff
      const user = await client.users.fetch(userId).catch(() => null);
      if (user) {
        user.send("🔒 Your modmail thread has been closed. If you need further help, you can DM me again.").catch(() => {});
      }
      modmailChannel.send("🔒 This modmail thread will be deleted in 10 seconds.");
      setTimeout(() => {
        modmailChannel.delete().catch(() => {});
      }, 10000);
      if (MODMAIL_LOG_CHANNEL_ID) {
        const guild = client.guilds.cache.get(config.guilds.guild_id);
        const logChannel = guild.channels.cache.get(MODMAIL_LOG_CHANNEL_ID);
        if (logChannel) {
          logChannel.send(`🔒 Modmail thread for <@${userId}> closed at ${formatTimestamp()}`);
        }
      }
    } else if (message.channel.type === "DM") {
      message.reply("No open modmail thread found to close.");
    }
    return;
  }
});

// ----------------------------------| Config handlers:
if(!config.users.owner) {
  console.log('\n[ERR] Configuration missing:'.bold.red)
  console.log('\n[ERR] Missing value in the variable "owner" in config.json.\n'.bold.red);
  process.exit(1);
}

if(!config.users.client_id) {
  console.log('\n[ERR] Configuration missing:'.bold.red)
  console.log('\n[ERR] Missing value in the variable "client_id" in config.json.\n'.bold.red);
  process.exit(1);
}

if(!config.guilds.guild_id) {
  console.log('\n[ERR] Configuration missing:'.bold.red)
  console.log('\n[ERR] Missing value in the variable "guild_id" in config.json.\n'.bold.red);
  process.exit(1);
}

// ----------------------------------| Crash Logger:
process.on('unhandledRejection', (reason, promis) => {
  console.log('\n[ERR] An error has been handled. :: unhandledRejection\n'.bold.red);
  console.log("[ERR] Reason: ".red + `${reason}`.underline.italic.yellow + "\n");
  console.log(promis)
  console.log("[ERR] Please check the error location above the loaded commands handler. (If possible)\n".bold.red);
  //process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.log('\n[ERR] An error has been handled. :: uncaughtException\n'.bold.red);
  console.log("[ERR] Error: ".red + err + "\n");
  console.log("[ERR] Please check the error location above the loaded commands handler. (If possible)\n".bold.red);
  //process.exit(1);
});

// ----------------------------------| Webhost:
const express = require('express');
const app = express();

app.get('/', (request, response) => {
  return response.sendFile('./webhost/index.html', { root: '.'});
});

app.listen(3000, () => {
  console.log('[SERVER] Server is Ready!'.bold.brightGreen);
});

// ----------------------------------| Login to the bot:
client.login(process.env.TOKEN).catch(() => console.warn("[ERR] Invalid Client Token was provided, or Missing Intents.".bold.red))