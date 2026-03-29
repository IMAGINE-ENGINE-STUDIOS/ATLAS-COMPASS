import { useState } from "react";
import { Plus, Calendar, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { SectionHeader, StatusBadge } from "@/components/DashboardWidgets";

const projects = [
  {
    name: "OPEC Supply Chain Modernization",
    client: "OPEC Consortium",
    progress: 72,
    status: "On Track",
    priority: "Critical",
    tasks: { total: 48, done: 35 },
    deadline: "Apr 30, 2024",
  },
  {
    name: "EU Carbon Credit Exchange",
    client: "European Commission",
    progress: 45,
    status: "At Risk",
    priority: "High",
    tasks: { total: 62, done: 28 },
    deadline: "Jun 15, 2024",
  },
  {
    name: "Maersk Fleet Digitization",
    client: "Maersk Group",
    progress: 91,
    status: "On Track",
    priority: "High",
    tasks: { total: 34, done: 31 },
    deadline: "Mar 28, 2024",
  },
  {
    name: "Tesla Supply Network Integration",
    client: "Tesla Inc.",
    progress: 58,
    status: "On Track",
    priority: "Medium",
    tasks: { total: 55, done: 32 },
    deadline: "May 20, 2024",
  },
];

const tasks = [
  { title: "Finalize API integration with Checkout.com", project: "OPEC Supply Chain", priority: "Critical", status: "In Progress", assignee: "Dev Team A" },
  { title: "Review carbon credit tokenization spec", project: "EU Carbon Exchange", priority: "High", status: "Todo", assignee: "Legal Team" },
  { title: "Deploy fleet tracking v2.4", project: "Maersk Digitization", priority: "High", status: "In Review", assignee: "Ops Team" },
  { title: "Battery supply forecast model", project: "Tesla Integration", priority: "Medium", status: "In Progress", assignee: "Data Science" },
  { title: "Sovereign payment compliance audit", project: "OPEC Supply Chain", priority: "Critical", status: "Todo", assignee: "Compliance" },
];

export default function ProjectsPage() {
  const [view, setView] = useState<"projects" | "tasks">("projects");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">Enterprise project & task management</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      <div className="flex gap-2">
        {(["projects", "tasks"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${view === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            {v}
          </button>
        ))}
      </div>

      {view === "projects" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projects.map((project) => (
            <div key={project.name} className="bg-card rounded-lg border border-border p-5 hover:border-primary/30 transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{project.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{project.client}</p>
                </div>
                <StatusBadge status={project.status} variant={project.status === "On Track" ? "success" : "warning"} />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <StatusBadge status={project.priority} variant={project.priority === "Critical" ? "destructive" : project.priority === "High" ? "warning" : "default"} />
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> {project.deadline}</span>
              </div>
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{project.tasks.done}/{project.tasks.total} tasks</span>
                  <span className="font-mono text-foreground">{project.progress}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${project.progress}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "tasks" && (
        <div className="space-y-3">
          {tasks.map((task, i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-4 hover:border-primary/30 transition-all flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center ${
                  task.status === "In Progress" ? "bg-primary/10" : task.status === "In Review" ? "bg-accent/10" : "bg-muted"
                }`}>
                  {task.status === "In Progress" ? <Clock className="w-4 h-4 text-primary" /> :
                   task.status === "In Review" ? <CheckCircle className="w-4 h-4 text-accent" /> :
                   <AlertCircle className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.project} · {task.assignee}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={task.priority} variant={task.priority === "Critical" ? "destructive" : task.priority === "High" ? "warning" : "default"} />
                <StatusBadge status={task.status} variant={task.status === "In Progress" ? "success" : task.status === "In Review" ? "warning" : "default"} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
