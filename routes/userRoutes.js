const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

// 🚨 Necesitas importar la función que obtiene el cliente Supabase.
// Suponiendo que la función 'getSupabaseClient' está en index.js, la importamos.
const { supabase } = require('../index'); 

const router = express.Router();
const saltRounds = 10; // Definimos el factor de encriptación una sola vez
const MAX_ATTEMPTS = 5; // Límite de intentos fallidos
const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutos en milisegundos

// ----------------------------------------------------------------
// POST /register 
// ----------------------------------------------------------------
router.post('/register', [
    // Middleware de validación (el mismo que tenías antes)
    body('email').isEmail().withMessage('Email válido requerido'),
    body('username').isLength({ min: 3 }).withMessage('Username debe tener al menos 3 caracteres'),
    body('password').isLength({ min: 6 }).withMessage('Password debe tener al menos 6 caracteres'),
    body('firstName').notEmpty().withMessage('Nombre es requerido'),
    body('lastName').notEmpty().withMessage('Apellido es requerido'),
    body('recoveryAnswer').notEmpty().withMessage('Pregunta de recuperación es requerida'),
], async (req, res) => {
    try {
        // Inicializar Supabase dentro del handler (o usar la instancia que trae el router)
        // Usamos la función getSupabaseClient para obtener el cliente      
        if (!supabase) {
            return res.status(500).json({ success: false, message: 'Fallo al inicializar Supabase' });
        }

        // 1. Validar datos de entrada
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos de entrada inválidos',
                errors: errors.array()
            });
        }

        const { email, username, password, firstName, lastName, recoveryAnswer } = req.body;

        // 2. Verificar si el usuario ya existe
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('email, username')
            .or(`email.eq.${email},username.eq.${username}`)
            .limit(1)
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error durante la verificación de existencia:', checkError);
            return res.status(500).json({
                success: false,
                message: 'Error en el servicio de la base de datos.',
                details: checkError.message
            });
        }

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'El email o username ya está en uso'
            });
        }

        // 3. Encriptar contraseña
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const hashedrecoveryAnswer = await bcrypt.hash(recoveryAnswer, saltRounds);

        // 4. Crear usuario en la base de datos
        const { data, error } = await supabase
            .from('users')
            .insert([{
                email: email,
                username: username,
                password: hashedPassword,
                first_name: firstName,
                last_name: lastName,
                recovery_answer: hashedrecoveryAnswer,
                created_at: new Date().toISOString(),
            }])
            .select();

        if (error) {
            console.error('Error al crear usuario:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor'
            });
        }

        // 5. Respuesta exitosa
        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            user: {
                id: data[0].id,
                email: data[0].email,
                username: data[0].username,
                firstName: data[0].first_name,
                lastName: data[0].last_name
            }
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// ----------------------------------------------------------------
// POST /login 
// ----------------------------------------------------------------
router.post('/login', [
    body('email').notEmpty().withMessage('Email o nombre de usuario es requerido'), // Cambiado para reflejar la doble búsqueda
    body('password').notEmpty().withMessage('Password es requerido'),
], async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ success: false, message: 'Fallo al inicializar Supabase' });

        const { email, password } = req.body;
        let user;

        // 1. Lógica de búsqueda por Email o Username
        // Nota: El campo 'email' de la petición contiene el email o el username
        if (email.includes('@')) { // Asumimos que si contiene '@' es un email
             const { data: userData, error } = await supabase
                 .from('users')
                 .select('*')
                 .eq('email', email)
                 .limit(1)
                 .maybeSingle();
            
            user = userData;
            // Manejamos el error de Supabase aquí. Si hay un error real (no solo no encontrado), devolvemos 500.
            if (error) {
                 console.error('Error en búsqueda por email:', error);
                 return res.status(500).json({ success: false, message: 'Error en el servicio de la base de datos' });
             }
        } else {
            // Conseguir usuario mediante el username
            const { data: userData, error } = await supabase
                .from('users')
                .select('*')
                .eq('username', email)
                .limit(1)
                .maybeSingle();
            
            user = userData;
            if (error) {
                 console.error('Error en búsqueda por username:', error);
                 return res.status(500).json({ success: false, message: 'Error en el servicio de la base de datos' });
            }
        }
        
        if (!user) {
             return res.status(401).json({ success: false, message: 'Nombre de usuario/email o contraseña incorrectos' });
        }

        // 2. Lógica de Prevención de Fuerza Bruta
        const userCount = user.count || 0; // Intentos fallidos
        const lastLoginAttempt = user.last_login_attempt ? new Date(user.last_login_attempt) : new Date(0);
        const fiveMinutesAgo = new Date(Date.now() - BLOCK_DURATION_MS);
        
        // A) Bloqueo Activo
        if (userCount >= MAX_ATTEMPTS && lastLoginAttempt > fiveMinutesAgo) {
            const remainingTimeMs = Math.max(0, lastLoginAttempt.getTime() + BLOCK_DURATION_MS - Date.now());
            const remainingSeconds = Math.ceil(remainingTimeMs / 1000); // Tiempo restante en segundos
            
            return res.status(401).json({
                success: false,
                message: `Tu cuenta fue bloqueada por múltiples intentos fallidos. Intentá nuevamente en ${remainingSeconds} segundos.`,
                remainingTime: remainingTimeMs, // Devolvemos en MS para que el frontend pueda manejar el temporizador
            });
        }
        
        // B) Reinicio del Contador si el bloqueo expiró
        if (userCount >= MAX_ATTEMPTS && lastLoginAttempt <= fiveMinutesAgo) {
            // Reiniciamos el contador y actualizamos el timestamp del último intento
            const { error: updateError } = await supabase
                .from('users')
                .update({ count: 0, last_login_attempt: new Date().toISOString() })
                .eq('id', user.id);
                
            if (updateError) {
                console.error('Error al reiniciar contador:', updateError);
                // No detenemos el login, solo informamos el fallo interno
            }
            // Si el reinicio fue exitoso, user.count ahora es 0 para el siguiente paso.
            user.count = 0;
        }

        // 3. Verificar Contraseña
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
            // Contraseña incorrecta: Aumentar contador de intentos fallidos
            const newCount = user.count + 1;
            
            const { error: updateError } = await supabase
                .from('users')
                .update({ count: newCount, last_login_attempt: new Date().toISOString() })
                .eq('id', user.id);

            if (updateError) {
                console.error('Error al incrementar contador:', updateError);
                return res.status(500).json({ success: false, message: 'Error interno del servidor al registrar fallo de login' });
            }

            return res.status(401).json({ success: false, message: 'Nombre de usuario/email o contraseña incorrectos' });
        }
        
        // 4. Login Exitoso: Reiniciar Contador (si no fue reiniciado antes)
        if (user.count > 0) {
            const { error: updateError } = await supabase
                .from('users')
                .update({ count: 0, last_login_attempt: new Date().toISOString() })
                .eq('id', user.id);

            if (updateError) {
                console.error('Error al resetear contador en login exitoso:', updateError);
                // El login sigue siendo exitoso, pero esto es un fallo interno
            }
        }

        // 5. Respuesta Final Exitosa
        res.json({
            success: true,
            message: 'Login exitoso',
            user: { id: user.id, email: user.email, username: user.username, firstName: user.first_name, lastName: user.last_name }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// ----------------------------------------------------------------
// POST /recovery 
// ----------------------------------------------------------------
router.post('/recovery', [
    body('email').isEmail().withMessage('Email válido requerido'),
    body('recoveryAnswer').notEmpty().withMessage('Pregunta de recuperación es requerida'),
    body('password').isLength({ min: 6 }).withMessage('Password debe tener al menos 6 caracteres'),   
], async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ success: false, message: 'Fallo al inicializar Supabase' });

        const { email, password, recoveryAnswer } = req.body;

        // 1. Buscar usuario por email (necesitamos la respuesta hasheada)
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, username, first_name, last_name, recovery_answer')
            .eq('email', email)
            .limit(1)
            .maybeSingle();

        // Manejo de error de búsqueda en BD
        if (error && error.code !== 'PGRST116') {
            console.error('Error durante la búsqueda del usuario:', error);
            return res.status(500).json({ success: false, message: 'Error en la base de datos.', details: error.message });
        }

        // Usuario no encontrado o credenciales inválidas
        if (!user) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        // 2. Verificar pregunta de recuperación
        const isValidRecoveryAnswer = await bcrypt.compare(recoveryAnswer, user.recovery_answer);
        if (!isValidRecoveryAnswer) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        // 3. Encriptar y actualizar contraseña
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({ password: hashedPassword })
        .eq('id', user.id)
        .select();

        if (updateError) {
            console.error('Error al actualizar la contraseña:', updateError);
            return res.status(500).json({ success: false, message: 'Error al actualizar la contraseña' });
        }

        // 4. Respuesta exitosa
        const updated = updatedUser[0];
        res.json({
            success: true,
            message: 'Recuperación de contraseña exitosa',
            user: { id: updated.id, email: updated.email, username: updated.username, firstName: updated.first_name, lastName: updated.last_name }
        });

    } catch (error) {
        console.error('Error en recuperación de contraseña:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

module.exports = router;