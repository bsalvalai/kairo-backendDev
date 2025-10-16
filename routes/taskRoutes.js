const express = require('express');
const { body, validationResult, param } = require('express-validator');

// Importamos la función de conexión a Supabase y la clase Router
const { supabase } = require('../index'); 
const router = express.Router();

// ----------------------------------------------------------------
// POST /
// ----------------------------------------------------------------
router.post('/', [
    // Campos requeridos
    body('titulo').notEmpty().withMessage('El título es requerido'),
    body('usernameAsignado').notEmpty().withMessage('El nombre del usuario asignado es requerido'),
    // Campo de descripción agregado (guardado como 'descripcion' en la DB)
    body('descripcion').optional().isString().withMessage('El campo descripción debe ser texto'),
    
    // Campos opcionales con validación de tipo/valor
    body('prioridad').optional().isIn(['alta', 'media', 'baja']).withMessage('La prioridad debe ser: alta, media o baja'),
    body('fechaVencimiento').optional().isISO8601().withMessage('La fecha de vencimiento debe ser una fecha válida'),
    body('estado').optional().isIn(['pendiente', 'en_progreso', 'completada', 'cancelada']).withMessage('El estado debe ser: pendiente, en_progreso, completada o cancelada'),
    body('asignadoPor').optional().isString().withMessage('El campo asignadoPor debe ser texto'),
    body('nota').optional().isString().withMessage('El campo nota debe ser texto'),
    body('esPrioridad').optional().isBoolean().withMessage('El campo esPrioridad debe ser booleano'),
], async (req, res) => {
    try {
        // Usamos la Service Role Key para operaciones de DB más flexibles
        if (!supabase) return res.status(500).json({ success: false, message: 'Fallo al inicializar Supabase' });

        const { 
            titulo, 
            usernameAsignado, 
            descripcion, 
            prioridad, 
            fechaVencimiento, 
            estado, 
            asignadoPor, 
            nota, 
            esPrioridad 
        } = req.body;

        // 1. Buscar el usuario asignado por username para obtener su ID
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('username', usernameAsignado)
            .limit(1)
            .maybeSingle();

        if (userError) {
            console.error('Error al buscar usuario:', userError);
            return res.status(500).json({ success: false, message: 'Error al buscar el usuario' });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuario asignado no encontrado' });
        }
    
        const { data: tareaData, error: tareaError } = await supabase
            .from('tareas')
            .insert([
                {
                    titulo: titulo,
                    descripcion: descripcion || null, // <- Nuevo campo con valor por defecto null
                    prioridad: prioridad || null,
                    fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento).toISOString() : null,
                    estado: estado || 'pendiente',
                    asignadoPor: asignadoPor || null,
                    nota: nota || null,
                    fechaCreacion: new Date().toISOString(),
                    ultimaActualizacion: new Date().toISOString()
                }
            ])
            .select();

        if (tareaError) {
            console.error('Error al crear tarea:', tareaError);
            return res.status(500).json({ success: false, message: 'Error interno del servidor al crear la tarea' });
        }
        
        const tareaCreada = tareaData[0];

        // 3. Crear la asignación en la tabla asignaciones
        const { data: asignacionData, error: asignacionError } = await supabase
            .from('asignaciones')
            .insert([
                {
                    id_user: user.id,
                    id_tarea: tareaCreada.id,
                    esPrioridad: esPrioridad || false // Renombrado a snake_case para la DB
                }
            ])
            .select();

        if (asignacionError) {
            console.error('Error al crear asignación:', asignacionError);
            // Si falla la asignación, eliminamos la tarea para mantener consistencia
            await supabase
                .from('tareas')
                .delete()
                .eq('id', tareaCreada.id);
            
            return res.status(500).json({ success: false, message: 'Error al asignar la tarea al usuario' });
        }

        // 4. Respuesta exitosa
        const asignacionCreada = asignacionData[0];

        res.status(201).json({
            success: true,
            message: 'Tarea creada y asignada exitosamente',
            tarea: {
                id: tareaCreada.id,
                titulo: tareaCreada.titulo,
                descripcion: tareaCreada.descripcion, // <- Incluido en la respuesta
                prioridad: tareaCreada.prioridad,
                fechaCreacion: tareaCreada.fecha_creacion,
                fechaVencimiento: tareaCreada.fecha_vencimiento,
                estado: tareaCreada.estado,
                asignadoPor: tareaCreada.asignado_por,
                nota: tareaCreada.nota,
                ultimaActualizacion: tareaCreada.ultima_actualizacion
            },
            asignacion: {
                id: asignacionCreada.id,
                idUser: asignacionCreada.id_user,
                idTarea: asignacionCreada.id_tarea,
                esPrioridad: asignacionCreada.es_prioridad
            },
            usuarioAsignado: {
                username: usernameAsignado,
                id: user.id
            }
        });

    } catch (error) {
        console.error('Error en creación de tarea:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});


// ----------------------------------------------------------------
// GET /createdByUser/:username 
// ----------------------------------------------------------------
router.get('/createdByUser/:username', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ success: false, message: 'Fallo al inicializar Supabase' });
        const { username } = req.params;
        if (!username) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario es requerido' });
        }

        // 1. Buscar el usuario por username para obtener su ID (Necesario para la respuesta, aunque no para la consulta de tareas)
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .limit(1)
            .maybeSingle();

        if (userError) {
            console.error('Error al buscar usuario:', userError);
            return res.status(500).json({ success: false, message: 'Error al buscar el usuario' });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        // 2. Buscar tareas creadas por este usuario (usando 'asignado_por')
        const { data: tareas, error: tareasError } = await supabase
            .from('tareas')
            .select('*') // Selecciona todos los campos, incluyendo 'descripcion'
            .eq('asignadoPor', username)
            .order('fechaCreacion', { ascending: false });

        if (tareasError) {
            console.error('Error al buscar tareas:', tareasError);
            return res.status(500).json({ success: false, message: 'Error al buscar las tareas' });
        }

        // 3. Formatear y devolver la respuesta
        res.json({
            success: true,
            message: `Tareas creadas por ${username}`,
            usuario: {
                username: username,
                id: user.id
            },
            tareas: tareas.map(tarea => ({
                id: tarea.id,
                titulo: tarea.titulo,
                descripcion: tarea.descripcion, // <- Añadido el campo 'descripcion'
                prioridad: tarea.prioridad,
                fechaCreacion: tarea.fecha_creacion,
                fechaVencimiento: tarea.fecha_vencimiento,
                estado: tarea.estado,
                asignadoPor: tarea.asignado_por,
                nota: tarea.nota,
                ultimaActualizacion: tarea.ultima_actualizacion
            })),
            totalTareas: tareas.length
        });

    } catch (error) {
        console.error('Error en consulta de tareas creadas:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// ----------------------------------------------------------------
// GET /assignedToUser/:username (Consulta tareas asignadas a un usuario)
// Ruta final: GET /api/tasks/assignedToUser/:username
// ----------------------------------------------------------------
router.get('/assignedToUser/:username', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ success: false, message: 'Fallo al inicializar Supabase' });

        const { username } = req.params;

        if (!username) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario es requerido' });
        }

        // 1. Buscar el usuario por username para obtener su ID
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .limit(1)
            .maybeSingle();

        if (userError) {
            console.error('Error al buscar usuario:', userError);
            return res.status(500).json({ success: false, message: 'Error al buscar el usuario' });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        // 2. Buscar asignaciones para este usuario y hacer JOIN con la tabla 'tareas'
        // El select usa la notación `tasks (*)` para traer todos los campos de la tabla tareas.
        const { data: asignaciones, error: asignacionesError } = await supabase
            .from('asignaciones')
            .select(`
                *,
                tareas (*)
            `)
            .eq('id_user', user.id)
            .order('id', { ascending: false });

        if (asignacionesError) {
            console.error('Error al buscar asignaciones:', asignacionesError);
            return res.status(500).json({ success: false, message: 'Error al buscar las asignaciones' });
        }

        // 3. Formatear la respuesta
        const tareasAsignadas = asignaciones.map(asignacion => ({
            asignacion: {
                id: asignacion.id,
                idUser: asignacion.id_user,
                idTarea: asignacion.id_tarea,
                esPrioridad: asignacion.es_prioridad
            },
            tarea: {
                id: asignacion.tareas.id,
                titulo: asignacion.tareas.titulo,
                descripcion: asignacion.tareas.descripcion, 
                prioridad: asignacion.tareas.prioridad,
                fechaCreacion: asignacion.tareas.fecha_creacion,
                fechaVencimiento: asignacion.tareas.fecha_vencimiento,
                estado: asignacion.tareas.estado,
                asignadoPor: asignacion.tareas.asignado_por,
                nota: asignacion.tareas.nota,
                ultimaActualizacion: asignacion.tareas.ultima_actualizacion
            }
        }));

        res.json({
            success: true,
            message: `Tareas asignadas a ${username}`,
            usuario: {
                username: username,
                id: user.id
            },
            tareasAsignadas: tareasAsignadas,
            totalTareas: tareasAsignadas.length
        });

    } catch (error) {
        console.error('Error en consulta de tareas asignadas:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// ----------------------------------------------------------------
// PATCH /priority/:idTarea (Cambia el campo esPrioridad para un usuario asignado)
// ----------------------------------------------------------------
router.patch('/priority/:idTarea', [
    param('idTarea').isInt().withMessage('El ID de la tarea debe ser un número entero'),
    body('username').notEmpty().withMessage('El nombre de usuario asignado es requerido'),
], async (req, res) => {
    try {
        
        if (!supabase) return res.status(500).json({ success: false, message: 'Fallo al inicializar Supabase' });

        const { idTarea } = req.params;
        const { username } = req.body;


        // 1. Buscar el ID del usuario
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .limit(1)
            .maybeSingle();

        if (userError) {
            console.error('Error al buscar usuario:', userError);
            return res.status(500).json({ success: false, message: 'Error al buscar el usuario' });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuario asignado no encontrado' });
        }

        const userId = user.id;

        // 2. Buscar la asignación actual para obtener el valor de esPrioridad
        const { data: currentAsignacion, error: fetchError } = await supabase
            .from('asignaciones')
            .select('esPrioridad')
            .eq('id_tarea', idTarea)
            .eq('id_user', userId)
            .single(); // Usamos single para esperar una sola fila o null

        if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 es "No rows found"
            console.error('Error al obtener la asignación actual:', fetchError);
            return res.status(500).json({ success: false, message: 'Error al obtener el estado de prioridad actual.' });
        }
        
        if (!currentAsignacion) {
            return res.status(404).json({ 
                success: false, 
                message: 'No se encontró una asignación para esta tarea y usuario.' 
            });
        }

        // 3. Invertir el valor de esPrioridad
        const nuevaPrioridad = !currentAsignacion.es_prioridad;
        
        // 4. Actualizar el campo 'esPrioridad' en la tabla 'asignaciones'
        const { data: updatedAsignacion, error: updateError } = await supabase
            .from('asignaciones')
            .update({ esPrioridad: nuevaPrioridad }) // Usamos snake_case para la DB
            .eq('id_tarea', idTarea)
            .eq('id_user', userId)
            .select();
        
        if (updateError) {
            console.error('Error al actualizar la prioridad:', updateError);
            return res.status(500).json({ success: false, message: 'Error al actualizar la prioridad de la asignación' });
        }

        // La verificación de updatedAsignacion.length ya no es necesaria aquí porque ya chequeamos antes.

        // 5. Respuesta exitosa
        const asignacion = updatedAsignacion[0];

        res.json({
            success: true,
            message: `Prioridad de tarea ${idTarea} actualizada a ${nuevaPrioridad} para el usuario ${username}`,
            asignacionActualizada: {
                id: asignacion.id,
                idUser: asignacion.id_user,
                idTarea: asignacion.id_tarea,
                esPrioridad: asignacion.es_prioridad
            }
        });

    } catch (error) {
        console.error('Error en el endpoint de actualización de prioridad:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// ----------------------------------------------------------------
// PATCH /note/:id (Actualiza el campo nota de una tarea)
// ----------------------------------------------------------------
router.patch('/note/:id', [
    param('id').isInt().withMessage('El ID de la tarea debe ser un número entero'),
    body('nota').isString().optional({ nullable: true }).withMessage('La nota debe ser texto')
], async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ success: false, message: 'Fallo al inicializar Supabase' });

        const { id } = req.params;
        const { nota } = req.body;
        
        const updateData = { 
            nota: nota,
            ultima_actualizacion: new Date().toISOString()
        };

        const { data: updatedTarea, error: updateError } = await supabase
            .from('tareas')
            .update(updateData)
            .eq('id', id)
            .select();

        if (updateError) {
            console.error('Error al actualizar la nota de la tarea:', updateError);
            return res.status(500).json({ success: false, message: 'Error al actualizar la nota de la tarea' });
        }

        if (updatedTarea.length === 0) {
             return res.status(404).json({ 
                success: false, 
                message: 'Tarea no encontrada.' 
            });
        }

        res.json({
            success: true,
            message: `Nota de la tarea ${id} actualizada exitosamente.`,
            tarea: {
                id: updatedTarea[0].id,
                titulo: updatedTarea[0].titulo,
                nota: updatedTarea[0].nota,
                ultimaActualizacion: updatedTarea[0].ultima_actualizacion
            }
        });

    } catch (error) {
        console.error('Error en el endpoint de actualización de nota:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// ----------------------------------------------------------------
// PATCH /status/:id (Actualiza el campo estado de una tarea)
// ----------------------------------------------------------------
router.patch('/status/:id', [
    param('id').isInt().withMessage('El ID de la tarea debe ser un número entero'),
    body('estado').notEmpty().isIn(['pendiente', 'en_progreso', 'completada', 'cancelada']).withMessage('El estado debe ser: pendiente, en_progreso, completada o cancelada')
], async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ success: false, message: 'Fallo al inicializar Supabase' });

        const { id } = req.params;
        const { estado } = req.body;

        const updateData = { 
            estado: estado,
            ultima_actualizacion: new Date().toISOString()
        };

        const { data: updatedTarea, error: updateError } = await supabase
            .from('tareas')
            .update(updateData)
            .eq('id', id)
            .select();

        if (updateError) {
            console.error('Error al actualizar el estado de la tarea:', updateError);
            return res.status(500).json({ success: false, message: 'Error al actualizar el estado de la tarea' });
        }

        if (updatedTarea.length === 0) {
             return res.status(404).json({ 
                success: false, 
                message: 'Tarea no encontrada.' 
            });
        }

        res.json({
            success: true,
            message: `Estado de la tarea ${id} actualizado a '${estado}' exitosamente.`,
            tarea: {
                id: updatedTarea[0].id,
                titulo: updatedTarea[0].titulo,
                estado: updatedTarea[0].estado,
                ultimaActualizacion: updatedTarea[0].ultima_actualizacion
            }
        });

    } catch (error) {
        console.error('Error en el endpoint de actualización de estado:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// ----------------------------------------------------------------
// GET /priority/:username (Consulta tareas marcadas como prioritarias por un usuario)
// ----------------------------------------------------------------
router.get('/priority/:username', [
    param('username').notEmpty().withMessage('El nombre de usuario es requerido'),

], async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ success: false, message: 'Fallo al inicializar Supabase' });

        const { username } = req.params;

        // 1. Buscar el ID del usuario
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .limit(1)
            .maybeSingle();

        if (userError) {
            console.error('Error al buscar usuario:', userError);
            return res.status(500).json({ success: false, message: 'Error al buscar el usuario' });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        const userId = user.id;

        // 2. Buscar en 'asignaciones' donde es_prioridad es TRUE Y id_user coincide, y hacer JOIN con 'tareas'
        const { data: asignaciones, error: asignacionesError } = await supabase
            .from('asignaciones')
            .select(`
                esPrioridad,
                tareas (*)
            `)
            .eq('id_user', userId) // <-- FILTRO POR USUARIO ESPECÍFICO
            .eq('esPrioridad', true) // Filtramos solo las asignaciones prioritarias
            .order('id_tarea', { ascending: false }); 

        if (asignacionesError) {
            console.error('Error al buscar tareas prioritarias del usuario:', asignacionesError);
            return res.status(500).json({ success: false, message: 'Error al buscar las tareas prioritarias del usuario' });
        }

        // 3. Formatear la respuesta extrayendo los datos de la tarea
        const tareasPrioritarias = asignaciones.map(asignacion => ({
            id: asignacion.tareas.id,
            titulo: asignacion.tareas.titulo,
            descripcion: asignacion.tareas.descripcion,
            prioridad: asignacion.tareas.prioridad,
            fechaCreacion: asignacion.tareas.fecha_creacion,
            fechaVencimiento: asignacion.tareas.fecha_vencimiento,
            estado: asignacion.tareas.estado,
            asignadoPor: asignacion.tareas.asignado_por,
            nota: asignacion.tareas.nota,
            esPrioridad: asignacion.es_prioridad, 
            ultimaActualizacion: asignacion.tareas.ultima_actualizacion
        }));

        res.json({
            success: true,
            message: `Total de ${tareasPrioritarias.length} tareas marcadas como prioritarias por el usuario ${username}.`,
            usuario: {
                username: username,
                id: userId
            },
            tareasPrioritarias: tareasPrioritarias,
        });

    } catch (error) {
        console.error('Error en consulta de tareas prioritarias de usuario:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

module.exports = router;