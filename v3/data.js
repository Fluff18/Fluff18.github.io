/* Shared content for every style of the portfolio. Edit here, all styles update. */
window.RK=(function(){
var me={name:'Rahul M Koushik',first:'Rahul',title:'AI Engineer',location:'San Francisco Bay Area',
 line:'I build production LLM agents end to end: the user problem, the multi-agent loop, and the evals that prove it works.',
 open:'Open to AI Engineer and AI Product roles.',
 about:['Founder habits, engineer\u2019s hands. I build agents that ship, and the evals that decide whether they should.','I scope the problem with the people who have it, ship the first version fast, and keep the metric that says whether it helped.'],
 facts:[['Based in','San Francisco Bay Area'],['Doing','AI Engineer, HPE Storage'],['Before that','Cloud Software Engineer, HPE'],['Studied','M.S. CS, Arizona State, 2023'],['Started','B.Tech CSE, PES University, 2021'],['Focus','LLM agents, memory, evals, inference'],['Open to','AI Engineer, AI Product']],
 photo:'img/figure.webp',
 links:{email:'mailto:rkoushik@asu.edu',emailText:'rkoushik@asu.edu',linkedin:'https://www.linkedin.com/in/rahulkoushik/',linkedinText:'in/rahulkoushik',github:'https://github.com/Fluff18',githubText:'github.com/Fluff18',resume:'resume.html',story:function(id){return 'index.html#p-'+id}},
 papers:[['ViStA: Video Streaming and Analytics Benchmark','IEEE ISPASS 2021'],['True Random Numbers from Entropy Sources in Portable Computers','IEEE CONECCT 2021'],['PipeGAN: pipelined parallel GANs','Springer LNNS, 2020']]};
var P=[
{id:'zuo',t:'Zuo',k:'Personal AI harness · 2026',g:'ai',fit:1,tag:'Job queue, budgets, voice capture and agent teams, controlled from my phone; free NVIDIA, a PC GPU and a laptop as workers, Claude as planner.',img:'img/c-zuo.jpg'},
{id:'aitutor',t:'AI Tutor',k:'Learning app · 2026',g:'apps',tag:'Duolingo meets Instagram for learning AI engineering: a level path, quick quizzes, a carousel feed and reviewed lessons.',img:'img/c-aitutor.jpg'},
{id:'zzz',t:'Zzz',k:'iOS + Android · 2026',g:'apps',tag:'Gamified goal tracker: quests, points and rewards you set yourself. SwiftUI and Kotlin, Supabase behind it, live on the App Store.',img:'img/c-zzz.jpg'},
{id:'catan',t:'Catan Arena',k:'Self-learning agents · 2026',g:'research',tag:'A self-learning agent testbed with a statistical pass bar, so an agent only graduates when the improvement is real.',img:'img/c-catan.jpg'},
{id:'drone',t:'Drone Inspection Sim',k:'Robotics · 2026',g:'research',tag:'PX4 and Gazebo inspection drone with a Pi-class AI agent: YOLOv8 plus a small vision-language model, llama.cpp 18x faster than Ollama.',img:'img/c-drone.jpg'},
{id:'musaic',t:'musaic',k:'Generative media · 2026',g:'ai',tag:'An automated lo-fi music channel, from generation to upload, run by a small team of agents.',img:'img/c-musaic.jpg'},
{id:'quantum',t:'Quantum Slot Machine',k:'Quantum · 2025',g:'research',tag:'Randomness from real qubits on IBM Quantum hardware, wrapped in a slot machine so people can feel it.',img:'img/c-quantum.jpg'},
{id:'rideshare',t:'RideShare',k:'Distributed systems · 2020',g:'earlier',tag:'Fault-tolerant database-as-a-service on AWS for a ride-sharing app.',img:'img/c-rideshare.jpg'},
{id:'zoom',t:'Zoom Telehealth',k:'iOS + Android TV · 2022',g:'earlier',tag:'Doctor-driven telehealth on the Zoom Meeting SDK.',img:'img/c-zoom.jpg'},
{id:'paas',t:'Face Recognition, PaaS',k:'Cloud · 2022',g:'earlier',tag:'Live face recognition with Lambda, SQS and a Raspberry Pi.',img:'img/c-paas.jpg'},
{id:'iaas',t:'Face Recognition, IaaS',k:'Cloud · 2022',g:'earlier',tag:'Elastic face recognition on autoscaled EC2.',img:'img/c-iaas.jpg'},
{id:'hand',t:'Handwriting Recognition',k:'Android · 2022',g:'earlier',tag:'Digit recognition split across worker phones.',img:'img/c-hand.jpg'},
{id:'fetch',t:'Fetch Recipes',k:'iOS · 2022',g:'earlier',tag:'A Swift recipe app over TheMealDB.',img:'img/c-fetch.jpg'}];
var T=[
{y:'2026',s:'Feb · present',h:'AI Engineer',o:'Hewlett Packard Enterprise · Storage AI team · Bay Area',b:['Architected the production multi-agent LLM harness with guardrails that every team agent runs on; its Model Context Protocol (MCP) tool server handles 6,300+ tool calls a week across HPE Storage.','Built the memory layer for persistent agents: episodic memory, embeddings and vector search, and a context graph over 13,005 mined bugs and 5,600 grounded analyses.','Cut agent latency and cost per run with inference optimization: prompt caching and KV-cache reuse across agent steps, cache-coherent context updates, and prefill/decode-aware serving of Qwen models (27B, 35B) on vLLM.','Took the agent evaluation platform from idea to three production deployments in four weeks; rubric-based evals, LLM-as-a-judge scoring and a tracing dashboard for every agent run form the release gate.','Shipped agentic alert-triage and root-cause-analysis (RCA) systems to production, with self-improving loops that learn from their own failures.'],c:['Multi-agent','MCP','Memory and RAG','Inference','Evals','Guardrails']},


{y:'2023',s:'Jun 2023 · Feb 2026',h:'Cloud Software Engineer',o:'Hewlett Packard Enterprise · Storage · Bay Area',b:['Built the observability platform for 10K customers: cross-stack root-cause analysis cut resolution time from 30 to 3 minutes.','Shipped 6 Peer Motion features in Go across four storage array families, including the Nimble-to-Alletra migration path.','Built a documentation agent that updates docs on every pull request, saving 5 engineer-hours a week per team.'],c:['Go','Kubernetes','Spark','Storage']},
{y:'2022',s:'May · Aug 2022',h:'Software Engineering Intern',o:'Aruba, Hewlett Packard Enterprise · Tempe',b:['Built a test-automation tool that configures network topologies, saving an estimated 150k engineering hours a year.'],c:['Python','Automation']},
{y:'2022',s:'Feb 2022 · May 2023',h:'Research Aide',o:'The Luminosity Lab, Arizona State University · Tempe',b:['Led the iOS team on the TouchPoint apps; a telehealth flow saved doctors 15 minutes per visit.'],c:['Swift','Product']},
{y:'2021',s:'Jan · Jul 2021',h:'Technical Undergraduate Intern',o:'Webex by Cisco · Bengaluru',b:['APIs for scheduling calls and meetings in the Webex iOS SDK v3, and the Kitchen Sink sample app that demonstrates them.'],c:['iOS','SDK']},
{y:'2021',s:'2021 · 2023',h:'M.S. Computer Science',o:'Arizona State University · GPA 3.59',b:['Distributed systems and cloud computing.'],c:['Research','Cloud']},
{y:'2017',s:'2017 · 2021',h:'B.Tech Computer Science & Engineering',o:'PES University, Bengaluru · GPA 8.2',b:[],c:['C++','Java']}];
var A=[
{n:'3',u:'wins',h:'HPE hackathons won',p:'Two of the three were selected for HPE Fellow Review and are being implemented across the business unit.',y:'2024 · 2026'},
{n:'1',u:'patent',h:'Patent under way',p:'Filing in progress. The link goes here in a few weeks.',y:'2026'},
{n:'3',u:'papers',h:'Published research',p:'True random numbers from entropy sources, ViStA, PipeGAN.',y:'2021 · 2023'},
{n:'1',u:'award',h:'HPE Early Career Technologist',p:'Recognition for the RAG work and the shipping record.',y:'2024'}];
var STK=[
['Generative AI','What I build on',[['LLM agents','multi-agent, agentic workflows'],['MCP','tool servers and tool calling'],['Evals','rubric scoring, LLM-as-a-judge'],['Guardrails','checks every agent passes'],['Memory and RAG','embeddings, vector search, context graphs'],['Tracing','a dashboard for every agent run'],['Inference','vLLM, Qwen 27B and 35B, KV-cache reuse'],['LangGraph','multi-agent orchestration']]],
['Languages','Daily',[['Python','agents, pipelines, tooling'],['Go','HPE data-mobility services'],['TypeScript','React and Next.js'],['Swift','SwiftUI on iOS'],['Kotlin','Android'],['SQL','Postgres, Trino']]],
['Backend and data','Services and storage',[['FastAPI','services and tool servers'],['Node.js','product services'],['gRPC','service interfaces'],['Postgres','plus pgvector'],['Spark','log pipelines at scale'],['Supabase','auth and data for apps']]],
['Cloud and infra','Where it runs',[['Kubernetes','Helm, operators'],['Docker','everything ships in one'],['AWS','Lambda, SQS, EC2'],['Observability','dashboards, alerts, RCA']]],
['Product','How I decide',[['Problem scoping','with the people who have it'],['Metrics','pass bars and adoption'],['Shipping','idea to production in weeks'],['Apps','iOS, Android, web, solo']]]];
return {me:me,projects:P,experience:T,achievements:A,stack:STK};
})();
