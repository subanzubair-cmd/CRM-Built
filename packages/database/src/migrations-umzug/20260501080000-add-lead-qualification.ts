import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.addColumn('Property', 'isQualified', {
    type: 'BOOLEAN',
    allowNull: false,
    defaultValue: false,
  })

  await context.addColumn('Appointment', 'outcome', {
    type: 'TEXT',
    allowNull: true,
  })
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.removeColumn('Property', 'isQualified')
  await context.removeColumn('Appointment', 'outcome')
}
