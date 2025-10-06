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
  body('email').isEmail().withMessage('Email válido requerido'),
  body('username').isLength({ min: 3 }).withMessage('Username debe tener al menos 3 caracteres'),
  body('password').isLength({ min: 6 }).withMessage('Password debe tener al menos 6 caracteres'),
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

    // Verificar si el usuario ya existe
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
  body('email').isEmail().withMessage('Email válido requerido'),
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

    // Buscar usuario por email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
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
  body('email').isEmail().withMessage('Email válido requerido'),
  body('recoveryAnswer').notEmpty().withMessage('Pregunta de recuperación es requerida'),
  body('password').isLength({ min: 6 }).withMessage('Password debe tener al menos 6 caracteres'),
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
      message: 'Recuperación de contraseña exitosa',
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
    message: 'Servidor funcionando correctamente',
    timestamp: new Date().toISOString(),
  });
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