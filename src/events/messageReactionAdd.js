

const ChildLogger = require('leekslazylogger').ChildLogger;
const log = new ChildLogger();
const { MessageEmbed } = require('discord.js');
const fs = require('fs');

module.exports = {
	event: 'messageReactionAdd',
	async execute(client, [r, u], {config, Ticket, Setting}) {

		if (r.partial) 
			try {
				await r.fetch();
			} catch (err) {
				log.error(err);
				return;
			}

		let panelID = await Setting.findOne({ where: { key: 'panel_msg_id' } });
		if (!panelID) return;

		if(r.message.id !== panelID.get('value')) return;

		if(u.id === client.user.id) return;

		if (r.emoji.name !== config.panel.reaction && r.emoji.id !== config.panel.reaction) return;

		let channel = r.message.channel;

		const supportRole = channel.guild.roles.cache.get(config.staff_role);
		if (!supportRole)
			return channel.send(
				new MessageEmbed()
					.setColor(config.err_colour)
					.setTitle(':x: **Fout**')
					.setDescription(`${config.name} is niet juist geconfigureerd. Kan geen staff role vinden met het id \`${config.staff_role}\``)
					.setFooter(channel.guild.name, channel.guild.iconURL())
			);


		// everything is cool

		await r.users.remove(u.id); // effectively cancel reaction

		let tickets = await Ticket.findAndCountAll({
			where: {
				creator: u.id,
				open: true
			},
			limit: config.tickets.max
		});
	
		if (tickets.count >= config.tickets.max) {
			let ticketList = [];
			for (let t in tickets.rows)  {
				let desc = tickets.rows[t].topic.substring(0, 30);
				ticketList
					.push(`<#${tickets.rows[t].channel}>: \`${desc}${desc.length > 30 ? '...' : ''}\``);
			}
			let dm = u.dmChannel || await u.createDM();

			try {

				return dm.send(
					new MessageEmbed()
						.setColor(config.err_colour)
						.setAuthor(u.username, u.displayAvatarURL())
						.setTitle(`:x: **Je hebt al ${tickets.count} of meer open tickets**`)
						.setDescription(`Gebruik \`${config.prefix}sluit\` om een onnodig ticket te sluiten.\n\n${ticketList.join(',\n')}`)
						.setFooter(channel.guild.name, channel.guild.iconURL())
				);
		

			} catch (e) {

				let m = await channel.send(
					new MessageEmbed()
						.setColor(config.err_colour)
						.setAuthor(u.username, u.displayAvatarURL())
						.setTitle(`:x: **Je hebt al ${tickets.count} of meer open tickets**`)
						.setDescription(`Gebruik \`${config.prefix}sluit\` om een onnodig ticket te sluiten.\n\n${ticketList.join(',\n')}`)
						.setFooter(channel.guild.name + ' | Dit bericht wordt verwijderd in 15 seconden.', channel.guild.iconURL())
				);
		
				return m.delete({ timeout: 15000 });
			}
				
			
		}

		let topic = 'Geen onderwerp gegeven';

		let ticket = await Ticket.create({
			channel: '',
			creator: u.id,
			open: true,
			archived: false,
			topic: topic
		});

		let name = 'ticket-' + ticket.id;

		channel.guild.channels.create(name, {
			type: 'text',
			topic: `${u} | ${topic}`,
			parent: config.tickets.category,
			permissionOverwrites: [{
				id: channel.guild.roles.everyone,
				deny: ['VIEW_CHANNEL', 'SEND_MESSAGES']
			},
			{
				id: channel.guild.member(u),
				allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES', 'READ_MESSAGE_HISTORY']
			},
			{
				id: supportRole,
				allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES', 'READ_MESSAGE_HISTORY']
			}
			],
			reason: 'Lid maakte een ticket kanaal aan.'
		}).then(async c => {

			Ticket.update({
				channel: c.id
			}, {
				where: {
					id: ticket.id
				}
			});

			// require('../modules/archive').create(client, c); // create files

			let ping;
			switch (config.tickets.ping) {
			case 'staff':
				ping = `<@&${config.staff_role}>,\n`;
				break;
			case false:
				ping = '';
				break;
			default:
				ping = `@${config.tickets.ping},\n`;
			}

			await c.send(`${ping}, ${u.username} heeft een ticket gemaakt`);

			if (config.tickets.send_img) {
				const images = fs.readdirSync('user/images');
				await c.send({
					files: [
						'user/images/' +
						images[Math.floor(Math.random() * images.length)]
					]
				});
			}

			let text = config.tickets.text
				.replace('{{ name }}', u.username)
				.replace('{{ tag }}', u);


			let w = await c.send(
				new MessageEmbed()
					.setColor(config.colour)
					.setAuthor(u.username, u.displayAvatarURL())
					.setDescription(text)
					.addField('Onderwerp', `\`${topic}\` (via paneel)`)
					.setFooter(channel.guild.name, channel.guild.iconURL())
			);

			if (config.tickets.pin)
				await w.pin();
				// await w.pin().then(m => m.delete()); // oopsie, this deletes the pinned message

			if (config.logs.discord.enabled)
				client.channels.cache.get(config.logs.discord.channel).send(
					new MessageEmbed()
						.setColor(config.colour)
						.setAuthor(u.username, u.displayAvatarURL())
						.setTitle('Nieuw ticket (via paneel)')
						.setDescription(`\`${topic}\``)
						.addField('Maker', u, true)
						.addField('Kanaal', c, true)
						.setFooter(channel.guild.name, channel.guild.iconURL())
						.setTimestamp()
				);

			log.info(`${u.tag} created a new ticket (#${name}) via panel`);


		}).catch(log.error);
	}
};