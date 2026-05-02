import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.addColumn('ActivityLog', 'mirroredFromPropertyId', {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
    references: { model: 'Property', key: 'id' },
    onDelete: 'SET NULL',
  })
}

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.removeColumn('ActivityLog', 'mirroredFromPropertyId')
}
