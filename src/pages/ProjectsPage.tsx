import { useState } from "react";
import { Plus, Calendar, CheckCircle, Clock, AlertCircle, ArrowUpRight, FolderKanban, ListTodo } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageContainer, AnimatedSection, HeroHeader, EditorialDivider, fadeUp, staggerContainer } from "@/components/AnimatedLayout";
import { StatusBadge } from "@/components/DashboardWidgets";

const projects = [
  { name: "OPEC Supply Chain Modernization", client: "OPEC Consortium", progress: 72, status: "On Track", priority: "Critical", tasks: { total: 48, done: 35 }, deadline: "Apr 30, 2024" },
  { name: "EU Carbon Credit Exchange", client: "European Commission", progress: 45, status: "At Risk", priority: "High", tasks: { total: 62, done: 28 }, deadline: "Jun 15, 2024" },
  { name: "Maersk Fleet Digitization", client: "Maersk Group", progress: 91, status: "On Track", priority: "High", tasks: { total: 34, done: 31 }, deadline: "Mar 28, 2024" },
  { name: "Tesla Supply Network Integration", client: "Tesla Inc.", progress: 58, status: "On Track", priority: "Medium", tasks: { total: 55, done: 32 }, deadline: "May 20, 2024" },
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
    <PageContainer>
      <HeroHeader
        accent="Projects"
        title="Mission Control"
        subtitle="Enterprise project & task management — coordinating critical initiatives across global operations"
      />

      {/* View Toggle */}
      <AnimatedSection variant="fadeUp">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {(["projects", "tasks"] as const).map((v) => (
              <motion.button
                key={v}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setView(v)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold capitalize transition-all duration-300 flex items-center gap-2 ${view === v ? "gradient-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
              >
                {v === "projects" ? <FolderKanban className="w-4 h-4" /> : <ListTodo className="w-4 h-4" />}
                {v}
              </motion.button>
            ))}
          </div>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-2 px-5 py-2.5 gradient-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> New Project
          </motion.button>
        </div>
      </AnimatedSection>

      <EditorialDivider label={view === "projects" ? "Active Projects" : "Task Board"} />

      <AnimatePresence mode="wait">
        {view === "projects" && (
          <motion.div key="projects" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {projects.map((project, i) => (
              <motion.div
                key={project.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.1 }}
                whileHover={{ y: -4, scale: 1.01 }}
                className="bg-card rounded-xl border border-border p-6 hover:border-primary/20 transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{project.name}</h3>
                    <p className="text-[10px] text-muted-foreground mt-1">{project.client}</p>
                  </div>
                  <StatusBadge status={project.status} variant={project.status === "On Track" ? "success" : "warning"} />
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <StatusBadge status={project.priority} variant={project.priority === "Critical" ? "destructive" : project.priority === "High" ? "warning" : "default"} />
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> {project.deadline}</span>
                </div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-muted-foreground">{project.tasks.done}/{project.tasks.total} tasks</span>
                  <span className="font-mono font-bold text-foreground">{project.progress}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${project.progress}%` }}
                    transition={{ delay: 0.4 + i * 0.12, duration: 0.8 }}
                    className="h-full bg-primary rounded-full"
                  />
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {view === "tasks" && (
          <motion.div key="tasks" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-3">
            {tasks.map((task, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08 }}
                whileHover={{ x: 4 }}
                className="bg-card rounded-xl border border-border p-5 hover:border-primary/20 transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      task.status === "In Progress" ? "bg-primary/10" : task.status === "In Review" ? "bg-accent/10" : "bg-muted"
                    }`}
                  >
                    {task.status === "In Progress" ? <Clock className="w-5 h-5 text-primary" /> :
                     task.status === "In Review" ? <CheckCircle className="w-5 h-5 text-accent" /> :
                     <AlertCircle className="w-5 h-5 text-muted-foreground" />}
                  </motion.div>
                  <div>
                    <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{task.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{task.project} · {task.assignee}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={task.priority} variant={task.priority === "Critical" ? "destructive" : task.priority === "High" ? "warning" : "default"} />
                  <StatusBadge status={task.status} variant={task.status === "In Progress" ? "success" : task.status === "In Review" ? "warning" : "default"} />
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}
