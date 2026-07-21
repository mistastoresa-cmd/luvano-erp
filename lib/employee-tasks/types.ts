export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled'

export interface AssignTaskInput {
  tenantId: string
  employeeId: string
  title: string
  description?: string
  dueDate?: string
  assignedBy?: string
}

export interface EmployeeTask {
  id: string
  tenantId: string
  employeeId: string
  title: string
  description: string | null
  dueDate: string | null
  status: TaskStatus
  assignedBy: string | null
  createdAt: Date
}

export interface TasksService {
  assignTask(input: AssignTaskInput): Promise<EmployeeTask>
  // What the employee's job-tasks reference view calls — every task
  // assigned to them, regardless of status.
  listEmployeeTasks(tenantId: string, employeeId: string): Promise<EmployeeTask[]>
  updateTaskStatus(tenantId: string, taskId: string, status: TaskStatus): Promise<EmployeeTask>
}
