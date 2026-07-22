import { eq, and, desc } from 'drizzle-orm'
import { employeeTasks } from '@/db/schema'
import type { Db } from '@/db/client'
import { assertRoleAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type { TasksService, AssignTaskInput, EmployeeTask, TaskStatus } from './types'

const TASK_MANAGEMENT_ROLES = ['owner', 'accountant', 'branch_manager'] as const

export function createTasksService(db: Db): TasksService {
  return {
    async assignTask(context: CallerContext, input: AssignTaskInput): Promise<EmployeeTask> {
      assertRoleAudited(db, input.tenantId, context, [...TASK_MANAGEMENT_ROLES])
      const [row] = await db
        .insert(employeeTasks)
        .values({
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          title: input.title,
          description: input.description,
          dueDate: input.dueDate,
          assignedBy: input.assignedBy,
        })
        .returning()
      return row as EmployeeTask
    },

    async listEmployeeTasks(
      context: CallerContext,
      tenantId: string,
      employeeId: string
    ): Promise<EmployeeTask[]> {
      assertRoleAudited(db, tenantId, context, [...TASK_MANAGEMENT_ROLES])
      const rows = await db
        .select()
        .from(employeeTasks)
        .where(and(eq(employeeTasks.tenantId, tenantId), eq(employeeTasks.employeeId, employeeId)))
        .orderBy(desc(employeeTasks.createdAt))
      return rows as EmployeeTask[]
    },

    async updateTaskStatus(
      context: CallerContext,
      tenantId: string,
      taskId: string,
      status: TaskStatus
    ): Promise<EmployeeTask> {
      assertRoleAudited(db, tenantId, context, [...TASK_MANAGEMENT_ROLES])
      const [row] = await db
        .update(employeeTasks)
        .set({ status })
        .where(and(eq(employeeTasks.tenantId, tenantId), eq(employeeTasks.id, taskId)))
        .returning()
      if (!row) throw new Error(`employee_task ${taskId} not found for tenant`)
      return row as EmployeeTask
    },
  }
}
