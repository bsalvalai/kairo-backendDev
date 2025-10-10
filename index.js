const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');


const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());


const SUPABASE_URL="https://jgbddbtwopfwtmktgraw.supabase.co"

const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnYmRkYnR3b3Bmd3Rta3RncmF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTM1Njg0MiwiZXhwIjoyMDc0OTMyODQyfQ.vNfQIqA7BSsI9d4Dve75nz2SkvjYFlivZZLSrSiiokk"

// Configuración de Supabase
const supabaseUrl = SUPABASE_URL;
const supabaseKey = SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);


// Endpoint de registro
app.post('/api/register', [
  body('email').isEmail().withMessage('Email inválido'),
  body('username').isLength({ min: 3 }).withMessage('Username debe tener al menos 3 caracteres'),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres y 1 número.'),
  body('firstName').notEmpty().withMessage('Nombre es requerido'),
  body('lastName').notEmpty().withMessage('Apellido es requerido'),
  body('recoveryAnswer').notEmpty().withMessage('Pregunta de recuperación es requerida'),
], async (req, res) => {
  try {
    // Validar datos de entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada inválidos',
        errors: errors.array()
      });
    }

    const { email, username, password, firstName, lastName, recoveryAnswer } = req.body;

    //Verificar si la contraseña tiene al menos 8 caracteres y 1 número.
    if(!password.match(/^(?=.*[0-9])(?=.*[a-zA-Z]).{8,}$/)) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 8 caracteres y 1 número.'
      });
    }

    //Verificar que el username No puede contener caracteres especiales que no sea “_”(guión bajo) y puede contener números(0-9), Sin limitación de caracteres, No puede contener espacio 
    if(!username.match(/^[a-zA-Z0-9_]+$/)) {
      return res.status(400).json({
        success: false,
        message: 'El username no puede contener caracteres especiales que no sea “_”(guión bajo) y puede contener números(0-9), no puede contener espacios.'
      });
    }


    // Verificar si el username ya existe
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('email, username')
      .eq('username', username)
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

    const { data: existingUserEmail, error: checkErrorEmail } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

      if (checkErrorEmail && checkErrorEmail.code !== 'PGRST116') {
        console.error('Error durante la verificación de existencia:', checkErrorEmail);
        return res.status(500).json({
          success: false,
          message: 'Error en el servicio de la base de datos.',
          details: checkErrorEmail.message
        });
      }

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Nombre de usuario ya existente, elija otro.'
      });
    }

    if (existingUserEmail) {
      return res.status(400).json({
        success: false,
        message: 'El email ya está en uso, elija otro.'
      });
    }

    // Encriptar contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const hashedrecoveryAnswer = await bcrypt.hash(recoveryAnswer, saltRounds);

    // Crear usuario en la base de datos
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          email: email,
          username: username,
          password: hashedPassword,
          first_name: firstName,
          last_name: lastName,
          recovery_answer: hashedrecoveryAnswer,
          created_at: new Date().toISOString(),
        }
      ])
      .select();

    if (error) {
      console.error('Error al crear usuario:', error);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }

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

// Endpoint de login
app.post('/api/login', [
  body('email').notEmpty().withMessage('Email válido requerido'),
  body('password').notEmpty().withMessage('Password es requerido')
], async (req, res) => {
  try {
    // Validar datos de entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada inválidos',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    let user;

    if(email.endsWith('@flowbit.com')) {
      //Conseguir usuario mediante el correo
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .limit(1)
        .maybeSingle();

      if(error || !userData) {
        return res.status(401).json({
          success: false,
          message: 'Nombre de usuario/email o contraseña incorrectos'
        });
      }

      user = userData;
    } else {
      //Conseguir usuario mediante el username
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', email)
        .limit(1)
        .maybeSingle();

      if(error || !userData) {
        return res.status(401).json({
          success: false,
          message: 'Nombre de usuario/email o contraseña incorrectos'
        });
      }

      user = userData;
    }

    //Obtener el número de intentos de login fallidos de la base de datos, y si es mayor a 5, bloquear el login por 5 minutos. Verificar si el timestamp de la última vez que se intentó login es mayor a 5 minutos. Si es mayor, reiniciar el contador de intentos de login fallidos y permitir el login.
    
    // Inicializar campos si no existen
    const userCount = user.count || 0;
    const lastLoginAttempt = user.last_login_attempt ? new Date(user.last_login_attempt) : new Date(0);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // Si el usuario tiene 5 o más intentos fallidos Y el último intento fue hace menos de 5 minutos, bloquear
    if(userCount >= 5 && lastLoginAttempt > fiveMinutesAgo) {
      const remainingTime = Math.max(0, 5 * 60 * 1000 - (Date.now() - lastLoginAttempt.getTime()));
      return res.status(401).json({
        success: false,
        message: 'Tu cuenta fue bloqueada por múltiples intentos fallidos. Intentá nuevamente más tarde o contactá al administrador.',
        remainingTime: remainingTime,
      });
    }
    
    // Si el usuario tenía intentos fallidos pero ya pasaron 5 minutos, reiniciar el contador
    if(userCount >= 5 && lastLoginAttempt <= fiveMinutesAgo) {
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({ count: 0, last_login_attempt: new Date().toISOString() })
        .eq('id', user.id)
        .select()
        .maybeSingle()
        .limit(1);

        if(updateError) {
          return res.status(500).json({
            success: false,
            message: 'Error al actualizar el contador de intentos de login fallidos'
          });
        }

        user = updatedUser;
    }

      

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {

      //Incrementar el contador de intentos de login fallidos
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({ count: userCount + 1, last_login_attempt: new Date().toISOString() })
        .eq('id', user.id)
        .select();

      if(updateError) {
        return res.status(500).json({
          success: false,
          message: 'Error al actualizar el contador de intentos de login fallidos'
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Nombre de usuario/email o contraseña incorrectos'
      });
    }

    //UPDATE v2.0.0: Se deberá verificar si el usuario tiene las 6 tareas predefinidas, si no, crearlas.

    //modelo de tarea predefinida
    const tareasPredefinidas = [
      //Pendientes
      {
          //id
          titulo: "Propuesta técnica y estimación — e-commerce Grupo Andina",
          prioridad: "alta",
          fechaCreacion: new Date().toISOString(),
          fechaVencimiento: "2025-10-12T23:59:59.000Z",
          estado: "pendiente",
          asignadoPor: "Mateo Latigano",
          nota: "",
          ultimaActualizacion: new Date().toISOString(),
      },
      {
        //id
        titulo: "Plan de UAT — app logística LogiTrans",
        prioridad: "media",
        fechaCreacion: new Date().toISOString(),
        fechaVencimiento: "2025-10-15T23:59:59.000Z",
        estado: "pendiente",
        asignadoPor: "Mateo Latigano",
        nota: "",
        ultimaActualizacion: new Date().toISOString(),
      },

      //En progreso
      {
        //id
        titulo: "Integración de pagos (MP) — RetailFit, checkout unificado",
        prioridad: "alta",
        fechaCreacion: new Date().toISOString(),
        fechaVencimiento: "2025-10-10T23:59:59.000Z",
        estado: "en progreso",
        asignadoPor: "Mateo Latigano",
        nota: "",
        ultimaActualizacion: new Date().toISOString(),
      },
      {
        //id
        titulo: "Tablero PMO de KPIs por proyecto (Flowbit interno)",
        prioridad: "media",
        fechaCreacion: new Date().toISOString(),
        fechaVencimiento: "2025-10-12T23:59:59.000Z",
        estado: "en progreso",
        asignadoPor: "Mateo Latigano",
        nota: "",
        ultimaActualizacion: new Date().toISOString(),
      },

      //Completadas
      {
        //id
        titulo: "Kickoff CRM SaludPlus — acta y plan de comunicaciones",
        prioridad: "baja",
        fechaCreacion: new Date().toISOString(),
        fechaVencimiento: "2025-10-05T23:59:59.000Z",
        estado: "completada",
        asignadoPor: "Mateo Latigano",
        nota: "",
        ultimaActualizacion: new Date().toISOString(),
      },
      {
        //id
        titulo: "Entrega Sprint 4 AgroData — demo y retro con cliente",
        prioridad: "media",
        fechaCreacion: new Date().toISOString(),
        fechaVencimiento: "2025-10-06T23:59:59.000Z",
        estado: "completada",
        asignadoPor: "Mateo Latigano",
        nota: "",
        ultimaActualizacion: new Date().toISOString(),
      },
    ]

    const asignacionesPredefinidas = [
      {
        //id
        idUser: user.id,
        //idTarea: tareaData[0].id,
        esPrioridad: true  // Propuesta técnica y estimación — e-commerce Grupo Andina (Prioridad: Sí)
      },
      {
        //id
        idUser: user.id,
        //idTarea: tareaData[1].id,
        esPrioridad: false  // Plan de UAT — app logística LogiTrans (Prioridad: No)
      },
      {
        //id
        idUser: user.id,
        //idTarea: tareaData[2].id,
        esPrioridad: true  // Integración de pagos (MP) — RetailFit, checkout unificado (Prioridad: Sí)
      },
      {
        //id
        idUser: user.id,
        //idTarea: tareaData[3].id,
        esPrioridad: false  // Tablero PMO de KPIs por proyecto (Flowbit interno) (Prioridad: No)
      },
      {
        //id
        idUser: user.id,
        //idTarea: tareaData[4].id,
        esPrioridad: false  // Kickoff CRM SaludPlus — acta y plan de comunicaciones (Prioridad: No)
      },
      {
        //id
        idUser: user.id,
        //idTarea: tareaData[5].id,
        esPrioridad: true  // Entrega Sprint 4 AgroData — demo y retro con cliente (Prioridad: Sí)
      }
    ]

    // Verificar si el usuario ya tiene las tareas predefinidas asignadas
    const { data: asignacionesExistentes, error: checkAsignacionesError } = await supabase
      .from('asignaciones')
      .select(`
        *,
        tareas (*)
      `)
      .eq('id_user', user.id);

    if (checkAsignacionesError) {
      console.error('Error al verificar asignaciones existentes:', checkAsignacionesError);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar asignaciones existentes'
      });
    }

    // Si el usuario no tiene asignaciones o tiene menos de 6, crear las tareas predefinidas
    if (!asignacionesExistentes || asignacionesExistentes.length < 6) {
      console.log('Creando tareas predefinidas para el usuario:', user.username);
      
      // Array para almacenar los IDs de las tareas creadas
      const tareasCreadas = [];

      // Recorrer tareasPredefinidas y crear cada una en Supabase
      for (let i = 0; i < tareasPredefinidas.length; i++) {
        const tarea = tareasPredefinidas[i];
        
        // Crear la tarea en Supabase
        const { data: tareaData, error: tareaError } = await supabase
          .from('tareas')
          .insert([
            {
              titulo: tarea.titulo,
              prioridad: tarea.prioridad,
              fechaCreacion: tarea.fechaCreacion,
              fechaVencimiento: tarea.fechaVencimiento,
              estado: tarea.estado,
              asignadoPor: tarea.asignadoPor,
              nota: tarea.nota,
              ultimaActualizacion: tarea.ultimaActualizacion
            }
          ])
          .select();

        if (tareaError) {
          console.error('Error al crear tarea predefinida:', tareaError);
          return res.status(500).json({
            success: false,
            message: 'Error al crear tarea predefinida'
          });
        }

        // Guardar el ID de la tarea creada
        tareasCreadas.push(tareaData[0].id);

        // Crear la asignación correspondiente usando el ID de la tarea creada
        const asignacion = asignacionesPredefinidas[i];
        const { data: asignacionData, error: asignacionError } = await supabase
          .from('asignaciones')
          .insert([
            {
              id_user: asignacion.idUser,
              id_tarea: tareaData[0].id,
              esPrioridad: asignacion.esPrioridad
            }
          ])
          .select();

        if (asignacionError) {
          console.error('Error al crear asignación predefinida:', asignacionError);
          // Si falla la asignación, eliminar la tarea creada para mantener consistencia
          await supabase
            .from('tareas')
            .delete()
            .eq('id', tareaData[0].id);
          
          return res.status(500).json({
            success: false,
            message: 'Error al crear asignación predefinida'
          });
        }

        console.log(`Tarea "${tarea.titulo}" creada con ID: ${tareaData[0].id}`);
      }

      console.log('Todas las tareas predefinidas creadas exitosamente');
    } else {
      console.log('El usuario ya tiene las tareas predefinidas asignadas');
    }

    res.json({
      success: true,
      message: 'Login exitoso',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint de recuperación de contraseña
app.post('/api/recovery', [
  body('email').isEmail().withMessage('Email inválido'),
  body('recoveryAnswer').notEmpty().withMessage('Pregunta de recuperación es requerida'),
  body('password').isLength({ min: 8 }).withMessage('Password debe tener al menos 8 caracteres y 1 número.'),
], async (req, res) => {
  try {
    // Validar datos de entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada inválidos',
        errors: errors.array()
      });
    }

    const { email, password, recoveryAnswer } = req.body;

    //Verificar si la contraseña tiene al menos 8 caracteres y 1 número.
    if(!password.match(/^(?=.*[0-9])(?=.*[a-zA-Z]).{8,}$/)) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 8 caracteres y 1 número.'
      });
    }

    // Buscar usuario por email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error durante la búsqueda del usuario:', error);
      return res.status(500).json({
        success: false,
        message: 'Error en el servicio de la base de datos.',
        details: error.message
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Verificar pregunta de recuperación
    const isValidRecoveryAnswer = await bcrypt.compare(recoveryAnswer, user.recovery_answer);
    if (!isValidRecoveryAnswer) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Encriptar contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const { data: updatedUser, error: updateError } = await supabase
    .from('users')
    .update({ password: hashedPassword })
    .eq('id', user.id)
    .select();

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: 'Error al actualizar la contraseña'
      });
    }

    res.json({
      success: true,
      message: 'Restablecimiento de contraseña exitoso, por favor inicie sesión.',
      user: {
        id: updatedUser[0].id,
        email: updatedUser[0].email,
        username: updatedUser[0].username,
        firstName: updatedUser[0].first_name,
        lastName: updatedUser[0].last_name
      }
    });

  } catch (error) {
    console.error('Error en recuperación de contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint de prueba
app.get('/api/health', async (req, res) => {

  res.json({
    success: true,
    message: 'Servidor funcionando correctamente - SPRINT 3',
    timestamp: new Date().toISOString(),
  });
});


//ENDPOINTS TAREAS

//Crear una tarea
app.post('/api/tasks', [
  body('titulo').notEmpty().withMessage('El título es requerido'),
  body('usernameAsignado').notEmpty().withMessage('El nombre del usuario asignado es requerido'),
  body('prioridad').optional().isIn(['alta', 'media', 'baja']).withMessage('La prioridad debe ser: alta, media o baja'),
  body('fechaVencimiento').optional().isISO8601().withMessage('La fecha de vencimiento debe ser una fecha válida'),
  body('estado').optional().isIn(['pendiente', 'en progreso', 'completada']).withMessage('El estado debe ser: pendiente, en progreso o completada'),
  body('asignadoPor').optional().isString().withMessage('El campo asignadoPor debe ser texto'),
  body('nota').optional().isString().withMessage('El campo nota debe ser texto'),
  body('esPrioridad').optional().isBoolean().withMessage('El campo esPrioridad debe ser booleano')
], async (req, res) => {
  try {
    // Validar datos de entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada inválidos',
        errors: errors.array()
      });
    }

    const { titulo, usernameAsignado, prioridad, fechaVencimiento, estado, asignadoPor, nota, esPrioridad } = req.body;

    // Buscar el usuario asignado por username para obtener su ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('username', usernameAsignado)
      .limit(1)
      .maybeSingle();

    if (userError) {
      console.error('Error al buscar usuario:', userError);
      return res.status(500).json({
        success: false,
        message: 'Error al buscar el usuario'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario asignado no encontrado'
      });
    }

    // Crear la tarea en la base de datos
    const { data: tareaData, error: tareaError } = await supabase
      .from('tareas')
      .insert([
        {
          titulo: titulo,
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

    console.log(tareaData);
    console.log(tareaError);
    
    if (tareaError) {
      console.error('Error al crear tarea:', tareaError);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor al crear la tarea'
      });
    }

    // Crear la asignación en la tabla asignaciones
    const { data: asignacionData, error: asignacionError } = await supabase
      .from('asignaciones')
      .insert([
        {
          id_user: user.id,
          id_tarea: tareaData[0].id,
          esPrioridad: esPrioridad || false
        }
      ])
      .select();

    console.log(asignacionData);
    console.log(asignacionError);

    if (asignacionError) {
      console.error('Error al crear asignación:', asignacionError);
      // Si falla la asignación, eliminamos la tarea creada para mantener consistencia
      await supabase
        .from('tareas')
        .delete()
        .eq('id', tareaData[0].id);
      
      return res.status(500).json({
        success: false,
        message: 'Error al asignar la tarea al usuario'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Tarea creada y asignada exitosamente',
      tarea: {
        id: tareaData[0].id,
        titulo: tareaData[0].titulo,
        prioridad: tareaData[0].prioridad,
        fechaCreacion: tareaData[0].fechaCreacion,
        fechaVencimiento: tareaData[0].fechaVencimiento,
        estado: tareaData[0].estado,
        asignadoPor: tareaData[0].asignadoPor,
        nota: tareaData[0].nota,
        ultimaActualizacion: tareaData[0].ultimaActualizacion
      },
      asignacion: {
        id: asignacionData[0].id,
        idUser: asignacionData[0].id_user,
        idTarea: asignacionData[0].id_tarea,
        esPrioridad: asignacionData[0].esPrioridad
      },
      usuarioAsignado: {
        username: usernameAsignado,
        id: user.id
      }
    });

  } catch (error) {
    console.error('Error en creación de tarea:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

//Conseguir tareas creadas por un usuario
app.get('/api/tasks/createdByUser/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de usuario es requerido'
      });
    }

    // Buscar el usuario por username para obtener su ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .limit(1)
      .maybeSingle();

    if (userError) {
      console.error('Error al buscar usuario:', userError);
      return res.status(500).json({
        success: false,
        message: 'Error al buscar el usuario'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Buscar tareas creadas por este usuario (donde asignadoPor contiene el username)
    const { data: tareas, error: tareasError } = await supabase
      .from('tareas')
      .select('*')
      .eq('asignadoPor', username)
      .order('fechaCreacion', { ascending: false });

    if (tareasError) {
      console.error('Error al buscar tareas:', tareasError);
      return res.status(500).json({
        success: false,
        message: 'Error al buscar las tareas'
      });
    }

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
        prioridad: tarea.prioridad,
        fechaCreacion: tarea.fechaCreacion,
        fechaVencimiento: tarea.fechaVencimiento,
        estado: tarea.estado,
        asignadoPor: tarea.asignadoPor,
        nota: tarea.nota,
        ultimaActualizacion: tarea.ultimaActualizacion
      })),
      totalTareas: tareas.length
    });

  } catch (error) {
    console.error('Error en consulta de tareas creadas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

//Conseguir tareas asignadas a un usuario
app.get('/api/tasks/assignedToUser/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de usuario es requerido'
      });
    }

    // Buscar el usuario por username para obtener su ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .limit(1)
      .maybeSingle();

    if (userError) {
      console.error('Error al buscar usuario:', userError);
      return res.status(500).json({
        success: false,
        message: 'Error al buscar el usuario'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Buscar asignaciones para este usuario y obtener las tareas correspondientes
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
      return res.status(500).json({
        success: false,
        message: 'Error al buscar las asignaciones'
      });
    }

    const tareasAsignadas = asignaciones.map(asignacion => ({
      asignacion: {
        id: asignacion.id,
        idUser: asignacion.id_user,
        idTarea: asignacion.id_tarea,
        esPrioridad: asignacion.esPrioridad
      },
      tarea: {
        id: asignacion.tareas.id,
        titulo: asignacion.tareas.titulo,
        prioridad: asignacion.tareas.prioridad,
        fechaCreacion: asignacion.tareas.fechaCreacion,
        fechaVencimiento: asignacion.tareas.fechaVencimiento,
        estado: asignacion.tareas.estado,
        asignadoPor: asignacion.tareas.asignadoPor,
        nota: asignacion.tareas.nota,
        ultimaActualizacion: asignacion.tareas.ultimaActualizacion
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
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

//Actualizar prioridad de tarea asignada
app.put('/api/tasks/priority/:asignacionId', [
  body('esPrioridad').isBoolean().withMessage('El campo esPrioridad debe ser booleano')
], async (req, res) => {
  try {
    const { asignacionId } = req.params;
    const { esPrioridad } = req.body;

    // Validar datos de entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada inválidos',
        errors: errors.array()
      });
    }

    if (!asignacionId) {
      return res.status(400).json({
        success: false,
        message: 'El ID de asignación es requerido'
      });
    }

    // Verificar que la asignación existe
    const { data: asignacionExistente, error: checkError } = await supabase
      .from('asignaciones')
      .select('*')
      .eq('id', asignacionId)
      .limit(1)
      .maybeSingle();

    if (checkError) {
      console.error('Error al verificar asignación:', checkError);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar la asignación'
      });
    }

    if (!asignacionExistente) {
      return res.status(404).json({
        success: false,
        message: 'Asignación no encontrada'
      });
    }

    // Actualizar la prioridad de la asignación
    const { data: asignacionActualizada, error: updateError } = await supabase
      .from('asignaciones')
      .update({ esPrioridad: esPrioridad })
      .eq('id', asignacionId)
      .select();

    if (updateError) {
      console.error('Error al actualizar asignación:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Error al actualizar la prioridad de la asignación'
      });
    }

    res.json({
      success: true,
      message: 'Prioridad de asignación actualizada exitosamente',
      asignacion: {
        id: asignacionActualizada[0].id,
        idUser: asignacionActualizada[0].id_user,
        idTarea: asignacionActualizada[0].id_tarea,
        esPrioridad: asignacionActualizada[0].esPrioridad
      }
    });

  } catch (error) {
    console.error('Error en actualización de prioridad:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

//Actualizar todos los campos de una tarea
app.put('/api/tasks/:taskId', [
  body('titulo').optional().notEmpty().withMessage('El título no puede estar vacío'),
  body('usernameAsignado').optional().notEmpty().withMessage('El nombre del usuario asignado no puede estar vacío'),
  body('prioridad').optional().isIn(['alta', 'media', 'baja']).withMessage('La prioridad debe ser: alta, media o baja'),
  body('fechaVencimiento').optional().isISO8601().withMessage('La fecha de vencimiento debe ser una fecha válida'),
  body('estado').optional().isIn(['pendiente', 'en progreso', 'completada']).withMessage('El estado debe ser: pendiente, en progreso o completada.'),
  body('asignadoPor').optional().isString().withMessage('El campo asignadoPor debe ser texto'),
  body('nota').optional().isString().withMessage('El campo nota debe ser texto'),
  body('esPrioridad').optional().isBoolean().withMessage('El campo esPrioridad debe ser booleano')
], async (req, res) => {
  try {
    const { taskId } = req.params;
    const { titulo, usernameAsignado, prioridad, fechaVencimiento, estado, asignadoPor, nota, esPrioridad } = req.body;

    // Validar datos de entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada inválidos',
        errors: errors.array()
      });
    }

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: 'El ID de la tarea es requerido'
      });
    }

    // Verificar que la tarea existe
    const { data: tareaExistente, error: checkError } = await supabase
      .from('tareas')
      .select('*')
      .eq('id', taskId)
      .limit(1)
      .maybeSingle();

    if (checkError) {
      console.error('Error al verificar tarea:', checkError);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar la tarea'
      });
    }

    if (!tareaExistente) {
      return res.status(404).json({
        success: false,
        message: 'Tarea no encontrada'
      });
    }

    // Preparar los datos a actualizar
    const datosActualizacion = {
      ultimaActualizacion: new Date().toISOString()
    };

    // Solo actualizar campos que se proporcionaron
    if (titulo !== undefined) datosActualizacion.titulo = titulo;
    if (prioridad !== undefined) datosActualizacion.prioridad = prioridad;
    if (fechaVencimiento !== undefined) {
      datosActualizacion.fechaVencimiento = fechaVencimiento ? new Date(fechaVencimiento).toISOString() : null;
    }
    if (estado !== undefined) datosActualizacion.estado = estado;
    if (asignadoPor !== undefined) datosActualizacion.asignadoPor = asignadoPor;
    if (nota !== undefined) datosActualizacion.nota = nota;

    // Actualizar la tarea
    const { data: tareaActualizada, error: updateError } = await supabase
      .from('tareas')
      .update(datosActualizacion)
      .eq('id', taskId)
      .select();

    if (updateError) {
      console.error('Error al actualizar tarea:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Error al actualizar la tarea'
      });
    }

    let respuesta = {
      success: true,
      message: 'Tarea actualizada exitosamente',
      tarea: {
        id: tareaActualizada[0].id,
        titulo: tareaActualizada[0].titulo,
        prioridad: tareaActualizada[0].prioridad,
        fechaCreacion: tareaActualizada[0].fechaCreacion,
        fechaVencimiento: tareaActualizada[0].fechaVencimiento,
        estado: tareaActualizada[0].estado,
        asignadoPor: tareaActualizada[0].asignadoPor,
        nota: tareaActualizada[0].nota,
        ultimaActualizacion: tareaActualizada[0].ultimaActualizacion
      }
    };

    // Si se proporcionó un nuevo usuario asignado, actualizar la asignación
    if (usernameAsignado !== undefined) {
      // Buscar el usuario asignado por username para obtener su ID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('username', usernameAsignado)
        .limit(1)
        .maybeSingle();

      if (userError) {
        console.error('Error al buscar usuario:', userError);
        return res.status(500).json({
          success: false,
          message: 'Error al buscar el usuario asignado'
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuario asignado no encontrado'
        });
      }

      // Buscar la asignación existente
      const { data: asignacionExistente, error: asignacionError } = await supabase
        .from('asignaciones')
        .select('*')
        .eq('id_tarea', taskId)
        .limit(1)
        .maybeSingle();

      if (asignacionError) {
        console.error('Error al buscar asignación:', asignacionError);
        return res.status(500).json({
          success: false,
          message: 'Error al buscar la asignación existente'
        });
      }

      if (asignacionExistente) {
        // Actualizar la asignación existente
        const datosAsignacion = {
          id_user: user.id
        };

        if (esPrioridad !== undefined) {
          datosAsignacion.esPrioridad = esPrioridad;
        }

        const { data: asignacionActualizada, error: updateAsignacionError } = await supabase
          .from('asignaciones')
          .update(datosAsignacion)
          .eq('id', asignacionExistente.id)
          .select();

        if (updateAsignacionError) {
          console.error('Error al actualizar asignación:', updateAsignacionError);
          return res.status(500).json({
            success: false,
            message: 'Error al actualizar la asignación'
          });
        }

        respuesta.asignacion = {
          id: asignacionActualizada[0].id,
          idUser: asignacionActualizada[0].id_user,
          idTarea: asignacionActualizada[0].id_tarea,
          esPrioridad: asignacionActualizada[0].esPrioridad
        };
      } else {
        // Crear nueva asignación si no existe
        const { data: nuevaAsignacion, error: createAsignacionError } = await supabase
          .from('asignaciones')
          .insert([
            {
              id_user: user.id,
              id_tarea: taskId,
              esPrioridad: esPrioridad || false
            }
          ])
          .select();

        if (createAsignacionError) {
          console.error('Error al crear asignación:', createAsignacionError);
          return res.status(500).json({
            success: false,
            message: 'Error al crear la asignación'
          });
        }

        respuesta.asignacion = {
          id: nuevaAsignacion[0].id,
          idUser: nuevaAsignacion[0].id_user,
          idTarea: nuevaAsignacion[0].id_tarea,
          esPrioridad: nuevaAsignacion[0].esPrioridad
        };
      }

      respuesta.usuarioAsignado = {
        username: usernameAsignado,
        id: user.id
      };
    } else if (esPrioridad !== undefined) {
      // Si solo se actualiza la prioridad sin cambiar el usuario
      const { data: asignacionExistente, error: asignacionError } = await supabase
        .from('asignaciones')
        .select('*')
        .eq('id_tarea', taskId)
        .limit(1)
        .maybeSingle();

      if (asignacionError) {
        console.error('Error al buscar asignación:', asignacionError);
        return res.status(500).json({
          success: false,
          message: 'Error al buscar la asignación existente'
        });
      }

      if (asignacionExistente) {
        const { data: asignacionActualizada, error: updateAsignacionError } = await supabase
          .from('asignaciones')
          .update({ esPrioridad: esPrioridad })
          .eq('id', asignacionExistente.id)
          .select();

        if (updateAsignacionError) {
          console.error('Error al actualizar asignación:', updateAsignacionError);
          return res.status(500).json({
            success: false,
            message: 'Error al actualizar la prioridad de la asignación'
          });
        }

        respuesta.asignacion = {
          id: asignacionActualizada[0].id,
          idUser: asignacionActualizada[0].id_user,
          idTarea: asignacionActualizada[0].id_tarea,
          esPrioridad: asignacionActualizada[0].esPrioridad
        };
      }
    }

    res.json(respuesta);

  } catch (error) {
    console.error('Error en actualización de tarea:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Manejo de rutas no encontradas (debe ir al final, después de todas las rutas)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});


// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});