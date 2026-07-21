export type IdType = 'national_id' | 'iqama'
export type ContractType = 'unlimited' | 'fixed_term'
export type EmployeeStatus = 'active' | 'on_leave' | 'terminated'

export interface CreateEmployeeInput {
  tenantId: string
  branchId?: string
  name: string
  phone?: string
  email?: string
  nationalId?: string
  idType?: IdType
  idExpiryDate?: string
  nationality?: string
  jobTitle?: string
  department?: string
  hireDate: string
  baseSalary: number
  contractType?: ContractType
  contractEndDate?: string
  probationEndDate?: string
  gosiNumber?: string
  ibanNumber?: string
}

export interface UpdateEmployeeInput {
  branchId?: string
  name?: string
  phone?: string
  email?: string
  nationalId?: string
  idType?: IdType
  idExpiryDate?: string
  nationality?: string
  jobTitle?: string
  department?: string
  baseSalary?: number
  contractType?: ContractType
  contractEndDate?: string
  probationEndDate?: string
  gosiNumber?: string
  ibanNumber?: string
  status?: EmployeeStatus
}

export interface Employee {
  id: string
  tenantId: string
  employeeNumber: string
  branchId: string | null
  name: string
  phone: string | null
  email: string | null
  nationalId: string | null
  idType: IdType
  idExpiryDate: string | null
  nationality: string | null
  jobTitle: string | null
  department: string | null
  hireDate: string
  baseSalary: number
  contractType: ContractType
  contractEndDate: string | null
  probationEndDate: string | null
  gosiNumber: string | null
  ibanNumber: string | null
  userId: string | null
  status: EmployeeStatus
  terminatedAt: string | null
  terminationReason: string | null
  createdAt: Date
}

export interface EmployeesService {
  // Allocates the next sequential employee_number for the tenant atomically
  // (employee_number_counters, same "atomic relative update" family as
  // applyInventoryDelta/redeemCoupon) and creates the employee row with it —
  // the caller never supplies employeeNumber.
  createEmployee(input: CreateEmployeeInput): Promise<Employee>
  updateEmployee(tenantId: string, employeeId: string, input: UpdateEmployeeInput): Promise<Employee>
  getEmployee(tenantId: string, employeeId: string): Promise<Employee | null>
  listEmployees(tenantId: string): Promise<Employee[]>
}
