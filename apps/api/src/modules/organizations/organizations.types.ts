export interface OrganizationNode {
  id: string
  companyId: string
  parentId: string | null
  name: string
  depth: number
  sortOrder: number
  approverId: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  children: OrganizationNode[]
}
