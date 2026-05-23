import { FolderOpen, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { desktopApi } from "../services/desktopApi";
import type { IdeaProjectTask } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

interface ProjectPickerProps {
  value?: string;
  onChange: (value: string) => void;
  onPicked?: (value: string) => void;
  onTaskPicked?: (task: IdeaProjectTask) => void;
  autoPickIdeaTask?: boolean;
}

export function ProjectPicker({
  value,
  onChange,
  onPicked,
  onTaskPicked,
  autoPickIdeaTask = false,
}: ProjectPickerProps) {
  const [ideaTasks, setIdeaTasks] = useState<IdeaProjectTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const autoPickedRef = useRef(false);
  const manualTouchedRef = useRef(false);

  const selectedTaskId = useMemo(() => {
    return ideaTasks.find((task) => task.projectPath === value)?.id;
  }, [ideaTasks, value]);

  const taskOptions = useMemo(
    () =>
      ideaTasks.map((task) => ({
        label: taskLabel(task),
        value: task.id,
      })),
    [ideaTasks],
  );

  useEffect(() => {
    void refreshIdeaTasks(true);
  }, []);

  async function refreshIdeaTasks(allowAutoPick = false) {
    setLoadingTasks(true);
    try {
      const tasks = await desktopApi.listIdeaProjectTasks();
      setIdeaTasks(tasks);
      const candidate = tasks.find((task) => task.active) || tasks[0];
      if (
        allowAutoPick &&
        autoPickIdeaTask &&
        candidate &&
        !autoPickedRef.current &&
        !manualTouchedRef.current
      ) {
        autoPickedRef.current = true;
        applyIdeaTask(candidate);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingTasks(false);
    }
  }

  function applyIdeaTask(task: IdeaProjectTask) {
    onChange(task.projectPath);
    onTaskPicked?.(task);
  }

  async function chooseDirectory() {
    const selected = await desktopApi.pickDirectory();
    if (typeof selected === "string") {
      manualTouchedRef.current = true;
      onChange(selected);
      onPicked?.(selected);
    }
  }

  return (
    <div className="project-picker-stack">
      <div className="project-picker">
        <Select
          className="project-picker-select"
          value={selectedTaskId || ""}
          onChange={(event) => {
            const task = ideaTasks.find((item) => item.id === event.target.value);
            if (task) applyIdeaTask(task);
          }}
          placeholder="选择 IDEA 任务"
          options={taskOptions}
          disabled={loadingTasks || ideaTasks.length === 0}
        />
        <Button
          aria-label="刷新 IDEA 任务"
          size="icon"
          type="button"
          variant="outline"
          disabled={loadingTasks}
          onClick={() => void refreshIdeaTasks()}
        >
          <RotateCcw size={16} />
        </Button>
      </div>
      <div className="project-picker">
        <Input
          value={value}
          onChange={(event) => {
            manualTouchedRef.current = true;
            onChange(event.target.value);
          }}
          placeholder={ideaTasks.length > 0 ? "手动项目路径" : "项目路径"}
        />
        <Button type="button" variant="outline" onClick={chooseDirectory}>
          <FolderOpen size={16} />
          浏览
        </Button>
      </div>
    </div>
  );
}

function taskLabel(task: IdeaProjectTask): string {
  return [
    task.active ? "当前" : "",
    task.application || task.label,
    task.branchName,
    task.reqNo,
  ]
    .filter(Boolean)
    .join(" · ");
}
