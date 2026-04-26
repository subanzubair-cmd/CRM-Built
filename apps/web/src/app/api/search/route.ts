import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  Property,
  Contact,
  PropertyContact,
  Message,
  Note,
  Task,
  PropertyFile,
  Op,
} from '@crm/database'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })
  const like = `%${q}%`

  const [properties, contacts, messages, notes, tasks, files] = await Promise.all([
    Property.findAll({
      where: {
        [Op.or]: [
          { streetAddress: { [Op.iLike]: like } },
          { normalizedAddress: { [Op.iLike]: like } },
          { city: { [Op.iLike]: like } },
        ],
      },
      attributes: ['id', 'streetAddress', 'city', 'state', 'zip', 'propertyStatus', 'leadType'],
      limit: 5,
      raw: true,
    }),
    Contact.findAll({
      where: {
        [Op.or]: [
          { firstName: { [Op.iLike]: like } },
          { lastName: { [Op.iLike]: like } },
          { phone: { [Op.iLike]: like } },
          { email: { [Op.iLike]: like } },
        ],
      },
      attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
      include: [
        {
          model: PropertyContact,
          as: 'properties',
          separate: true,
          limit: 1,
          include: [
            { model: Property, as: 'property', attributes: ['id', 'streetAddress', 'propertyStatus', 'leadType'] },
          ],
        },
      ],
      limit: 5,
    }),
    Message.findAll({
      where: { body: { [Op.iLike]: like } },
      attributes: ['id', 'body', 'channel', 'createdAt'],
      include: [{ model: Property, as: 'property', attributes: ['id', 'streetAddress', 'propertyStatus', 'leadType'] }],
      order: [['createdAt', 'DESC']],
      limit: 3,
    }),
    Note.findAll({
      where: { body: { [Op.iLike]: like } },
      attributes: ['id', 'body', 'createdAt'],
      include: [{ model: Property, as: 'property', attributes: ['id', 'streetAddress', 'propertyStatus', 'leadType'] }],
      order: [['createdAt', 'DESC']],
      limit: 3,
    }),
    Task.findAll({
      where: { title: { [Op.iLike]: like } },
      attributes: ['id', 'title', 'status', 'dueAt'],
      include: [{ model: Property, as: 'property', attributes: ['id', 'streetAddress', 'propertyStatus', 'leadType'] }],
      limit: 3,
    }),
    PropertyFile.findAll({
      where: { name: { [Op.iLike]: like } },
      attributes: ['id', 'name', 'type'],
      include: [{ model: Property, as: 'property', attributes: ['id', 'streetAddress', 'propertyStatus', 'leadType'] }],
      limit: 3,
    }),
  ])

  return NextResponse.json({
    results: {
      properties,
      contacts: contacts.map((c) => c.get({ plain: true })),
      messages: messages.map((m) => m.get({ plain: true })),
      notes: notes.map((n) => n.get({ plain: true })),
      tasks: tasks.map((t) => t.get({ plain: true })),
      files: files.map((f) => f.get({ plain: true })),
    },
  })
}
