import { RANK } from "../../util/util.js";

export default {
	data: {
		name: 'kick',
		description: 'Kick a user from the world.',
		usage: 'kick <id> [reason]',
		aliases: ['k'],
		minRank: RANK.ADMIN,
	},
	async execute(client, args){
		if(client.rank<RANK.ADMIN&&client.world.simpleMods.value) return client.sendMessage({
			sender: 'server',
			data:{
				type: 'error',
			},
			text: 'Simple mods are enabled, no kick for u :3'
		});
		if(!args.length) return client.sendMessage({
			sender: 'server',
			data:{
				type: 'error',
			},
			text: `Usage: /${this.data.usage}`
		});
		let target = client.world.clients.get(parseInt(args[0]));
		if(!target) return client.sendMessage({
			sender: 'server',
			data:{
				type: 'error',
			},
			text: `Invalid user id. Usage: /${this.data.usage}`
		});
		if(target===client) return client.sendMessage({
			sender: 'server',
			data:{
				type: 'error',
			},
			text: `You can't kick yourself.`
		});
		if(target.rank<=RANK.DEVELOPER&&target.rank>=client.rank) return client.sendMessage({
			sender: 'server',
			data:{
				type: 'error',
			},
			text: `Target user's rank must be lower than yours.`
		});
		let reason = args.slice(1).join(" ");
		target.sendMessage({
			sender: 'server',
			data:{
				type: 'error',
			},
			text: `You were kicked from the world. ${reason ? `Reason: ${reason}` : ""}`
		});
		target.destroy();
		client.sendMessage({
			sender: 'server',
			data:{
				type: 'error',
			},
			text: `Kicked ${target.uid}${reason ? ` with reason: ${reason}.` : "."}`
		});
	}
}