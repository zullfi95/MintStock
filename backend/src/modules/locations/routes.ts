import express from 'express';
import { authenticateToken, requireRole, ROLES } from '../../shared/middleware/auth';
import { prisma } from '../../db';
import { logger } from '../../shared/utils/logger';

const router = express.Router();

// GET /api/locations - Список локаций с фильтром по типу
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { type } = req.query;
    
    const where: any = {};
    if (type) where.type = type as string;

    const locations = await prisma.location.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { stockItems: true, supervisorLocations: true }
        }
      }
    });

    res.json(locations);
  } catch (error) {
    logger.error('Failed to fetch locations', { error });
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// POST /api/locations - Создать локацию (только ADMIN)
router.post('/', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { name, type, address } = req.body;

    if (!name || !type || !['WAREHOUSE', 'SITE'].includes(type)) {
      return res.status(400).json({ error: 'Valid name and type (WAREHOUSE/SITE) are required' });
    }

    const location = await prisma.location.create({
      data: { name, type, address }
    });

    logger.info('Location created', { locationId: location.id, name: location.name, type: location.type, by: req.user?.username });
    res.status(201).json(location);
  } catch (error) {
    logger.error('Failed to create location', { error });
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// PUT /api/locations/:id - Редактировать локацию (только ADMIN)
router.put('/:id', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, address, isActive } = req.body;

    const location = await prisma.location.findUnique({ where: { id } });
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    if (type && !['WAREHOUSE', 'SITE'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const updated = await prisma.location.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(address !== undefined && { address }),
        ...(isActive !== undefined && { isActive })
      }
    });

    logger.info('Location updated', { locationId: updated.id, by: req.user?.username });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to update location', { error });
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// GET /api/locations/:id/supervisors - Получить супервайзоров объекта (только ADMIN)
router.get('/:id/supervisors', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;

    const supervisors = await prisma.supervisorLocation.findMany({
      where: { locationId: id },
      orderBy: { assignedAt: 'desc' }
    });

    res.json(supervisors);
  } catch (error) {
    logger.error('Failed to fetch supervisors', { error });
    res.status(500).json({ error: 'Failed to fetch supervisors' });
  }
});

// POST /api/locations/:id/supervisors - Привязать супервайзора (только ADMIN)
router.post('/:id/supervisors', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const location = await prisma.location.findUnique({ where: { id } });
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Проверка на дубликат
    const existing = await prisma.supervisorLocation.findUnique({
      where: {
        supervisorId_locationId: {
          supervisorId: username,
          locationId: id
        }
      }
    });

    if (existing) {
      return res.status(409).json({ error: 'Supervisor already assigned to this location' });
    }

    const assignment = await prisma.supervisorLocation.create({
      data: {
        supervisorId: username,
        locationId: id
      }
    });

    logger.info('Supervisor assigned', { username, locationId: id, by: req.user?.username });
    res.status(201).json(assignment);
  } catch (error) {
    logger.error('Failed to assign supervisor', { error });
    res.status(500).json({ error: 'Failed to assign supervisor' });
  }
});

// DELETE /api/locations/:id/supervisors/:username - Отвязать супервайзора (только ADMIN)
router.delete('/:id/supervisors/:username', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { id, username } = req.params;

    const assignment = await prisma.supervisorLocation.findUnique({
      where: {
        supervisorId_locationId: {
          supervisorId: username,
          locationId: id
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    await prisma.supervisorLocation.delete({
      where: {
        supervisorId_locationId: {
          supervisorId: username,
          locationId: id
        }
      }
    });

    logger.info('Supervisor unassigned', { username, locationId: id, by: req.user?.username });
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to unassign supervisor', { error });
    res.status(500).json({ error: 'Failed to unassign supervisor' });
  }
});

// GET /api/locations/my - Получить свои объекты (только SUPERVISOR)
router.get('/my', authenticateToken, async (req, res) => {
  try {
    if (req.user?.role !== ROLES.SUPERVISOR) {
      return res.status(403).json({ error: 'This endpoint is only for supervisors' });
    }

    const assignments = await prisma.supervisorLocation.findMany({
      where: { supervisorId: req.user.username },
      include: {
        location: true
      }
    });

    const locations = assignments.map(a => a.location);
    res.json(locations);
  } catch (error) {
    logger.error('Failed to fetch my locations', { error });
    res.status(500).json({ error: 'Failed to fetch my locations' });
  }
});

export default router;
