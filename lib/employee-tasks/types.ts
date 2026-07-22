import type { CallerContext } from '../authz/types'

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

// Assigning/managing work — owner/accountant/branch_manager. Self-service
// (an employee viewing/updating their own tasks) is deferred along with
// employee login (see docs/ARCHITECTURE.md); until then this is an HR-admin
// view, not an employee-facing one.
export interface TasksService {
  assignTask(context: CallerContext, input: AssignTaskInput): Promise<EmployeeTask>
  // What the employee's job-tasks reference view calls — every task
  // assigned to them, regardless of status.
  listEmployeeTasks(context: CallerContext, tenantId: string, employeeId: string): Promise<EmployeeTask[]>
  updateTaskStatus(
    context: CallerContext,
    tenantId: string,
    taskId: string,
    status: TaskStatus
  ): Promise<EmployeeTask>
}
