# Gnaws - Self-Hosted Game Server Platform (AWS CDK + Web UI)

> Deploy and manage game servers (Minecraft, Valheim, Palworld) on AWS with a simple web interface.  
> A cheaper alternative to traditional game server hosting — run servers on EC2 and only pay when playing.

**Gnaws** is a self-hosted game server platform that lets you spin up, stop, and manage dedicated servers without needing AWS or DevOps knowledge.

Perfect for:
- Friends who want to share a server
- Players tired of paying $20–50/month for hosting
- Anyone who wants full control over performance and cost

---

## Why Gnaws?

Running a game server has always been a pain:

| Problem | Traditional Fix | Gnaws |
|---|---|---|
| Your PC has to stay on 24/7 | Rent a server for ~$20–50/month | EC2 runs only when playing. A t3.large EC2 running 21 hours/week cost about $6-7/month |
| Friends can't start the server without you | Pay for always-on hosting | Friends can start/stop via simple webpage |
| Rented servers are slow or overpriced | Hope for the best | Your own dedicated EC2 — pick your instance type |
| Setup takes hours | Watch a 40-min YouTube tutorial | Deploy supported games in minutes |

**Gnaws** is an [AWS CDK](https://aws.amazon.com/cdk/) project that deploys a fully managed game server environment in your own AWS account. You get a simple website to install, manage, configure game servers without ever touching the AWS console. There is a simple permission system so your friends can start the server up themselves.

---

## Features

- **One-click** — Build your own infrastructure with a simple command. 
- **Web UI** — Create and manage game servers with simple web UI.
- **EC2 instance** — Runs on a dedicated instance type of your choosing, with no shared resources.
- **Pay only when playing** — Server auto-stops when not in use. Typical cost: a few dollars/month vs. $30–80+ for dedicated hosting.
- **Supported games out of the box** — Deploy popular game servers in a few clicks from a curated list.
- **Bring your own game** — SSH into the instance and install anything you want.
- **Friend access controls** — Assign roles so trusted friends can start/stop the server.
- **Your account, your data** — Everything lives in your AWS account. No third-party platform.

---

## How It Works

1. **Infrastructure**
   - AWS CDK managed resources in your own AWS account.

2. **Web UI**
   - A React app is hosted on S3 and served through CloudFront
   - This is the webpage where users create and manage servers

3. **Backend**
   - The UI sends requests to a Lambda backend
   - It handles actions like creating, starting, and stopping servers
   - It also manages user access and permissions

4. **Game Servers (EC2)**
   - Each game server runs on its own EC2 instance
   - You choose the instance type based on how much performance you need
   - Servers are not shared with anyone else

5. **Server Setup**
   - When an instance starts, a setup script installs the selected game server
   - The server is configured and started automatically

6. **Start / Stop Flow**
   - Start → launches the EC2 instance and starts the game server  
   - Stop → shuts down the instance so you stop paying for compute

6. **Connecting to the Server**
   - Players connect using the normal game multiplayer (EC2 IP + port)

---

## Prerequisites

* AWS Account https://aws.amazon.com/

---

## Getting Started

1. Sign in to your AWS account
2. Open AWS [CloudShell](https://console.aws.amazon.com/cloudshell)
3. Run the command below and follow the prompts. You'll be asked to choose a region and set a username
```
[ -d Gnaws ] || git clone https://github.com/pochusuwan/Gnaws.git && ./Gnaws/start.sh
```
4. Once complete, the webpage URL will be shown in the output. If your CloudShell session timed out during deployment, find the URL in [CloudFront](https://console.aws.amazon.com/cloudfront) under your distribution's domain name.
5. Go to your webpage and sign in with your username. You will be prompted to setup your password on first sign in.

---

## Supported Games

- Minecraft (Java)
- Minecraft (Paper)
- Palworld
- Valheim

> Don't see your game? SSH into the instance and install it manually

---

## Giving Friends Access
TODO
Simply give your friend website url and the shared password. Assign your friends different roles:

- new (Default) - View and join game servers only
- manager - Permission to start and stop server
- admin - All permissions: create, backup, configure, and terminate

---

## Cost Estimate

Costs vary by region and instance type. A rough example using `t3.large` in `us-east-1`:

| Usage | Estimated Cost |
|---|---|
| 14 hrs/week gaming | ~$4-5/month |
| 21 hrs/week gaming | ~$6-7/month |
| 42 hrs/week gaming | ~$13-14/month |
| EBS storage (25 GB) | ~$2/month |
| **vs. rented server** | **$25-50/month** |

> See [EC2 Pricing](https://aws.amazon.com/ec2/pricing/on-demand/) to estimate costs for your specific instance type and region.

---

## FAQ

### Is this cheaper than renting a Minecraft server?
Most likely — you only pay when the server is running on AWS EC2. Pick your server performance and cost.

### Do I need AWS knowledge?
No — deployment is automated and UI is simple.

### Is performance better than hosting providers?
Yes — you choose your EC2 instance type, so performance is predictable and not shared.

---

## Roadmap

- [ ] Automatic scheduled shutdowns (e.g., stop after 20 minutes if no players)
- [ ] Changing instance type
- [ ] Snapshot / backup management
- [ ] Changing password
- [ ] More supported games

---

## Project Structure

```
Gnaws/
├── bin/                    
│   └── gnaws.ts            # CDK app entry point
├── lib/
│   ├── gnaws-stack.ts      # Main stack definition
├── frontend/               # React Frontend
├── backend/                
│   ├── lambda              # Lambda backend
│   ├── stepfunctions       # Workflow step functions
├── game_server
│   ├── entrypoints         # EC2 shell scripts
│   ├── games               # Games script and config
└── README.md
```

---

## Contributing

Contributions are welcome! If you want to add support for a new game, fix a bug, or add features:

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/add-terraria`
3. Open a pull request

For major changes, please open an issue first to discuss the approach.

---

## License

[MIT](LICENSE)

---
