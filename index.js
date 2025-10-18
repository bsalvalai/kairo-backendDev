const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

//Porfas NUMERO 800
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

//

const userRoutes = require('./routes/userRoutes');
const taskRoutes = require('./routes/taskRoutes');

app.use('/api', userRoutes);
app.use('/api/tasks', taskRoutes);

// Endpoint de prueba
app.get('/api/health', async (req, res) => {
  res.json({
    success: true,
    message: 'Servidor funcionando correctamente - SPRINT 4',
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


app.listen(PORT, () => {
    console.log(`✅ Servidor Express corriendo en el puerto ${PORT}`);
}); 

// Para Vercel: exportar la app como función
module.exports = app;
