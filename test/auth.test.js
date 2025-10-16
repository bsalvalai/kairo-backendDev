// Configurar entorno de test
process.env.NODE_ENV = 'test';

const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const bcrypt = require('bcryptjs');
const proxyquire = require('proxyquire');

// ----------------------------------------------------------------
// 1. MOCKS DE SINON
// ----------------------------------------------------------------

// Objeto que simula la cadena de consultas de Supabase (Query Builder).
// Usa returnsThis() para que todos los métodos intermedios puedan encadenarse.
const mockQueryBuilder = {
    // Métodos intermedios encadenados
    select: sinon.stub().returnsThis(),
    or: sinon.stub().returnsThis(),
    eq: sinon.stub().returnsThis(),
    neq: sinon.stub().returnsThis(),
    limit: sinon.stub().returnsThis(),
    insert: sinon.stub().returnsThis(), // insert también retorna el builder
    
    // Métodos finales que devuelven Promesas
    single: sinon.stub(), 
    maybeSingle: sinon.stub(),
};

// Objeto principal del cliente Supabase: .from() debe devolver el Query Builder.
const mockSupabaseClient = {
    from: sinon.stub().returns(mockQueryBuilder),
};

let app;
let bcryptStub;

// ----------------------------------------------------------------
// 2. BLOQUE DE PRUEBAS
// ----------------------------------------------------------------
describe('API Auth Endpoints', () => {
    
    // Configuración que se ejecuta antes de cada test
    beforeEach(() => {
        // Simular bcrypt.hash() para devolver un valor constante
        bcryptStub = sinon.stub(bcrypt, 'hash').resolves('hashed_password_mock');
        
        // Cargar la aplicación, forzando que use nuestro mockSupabaseClient
        app = proxyquire('../index', {
            // Asegura que tu código usa este mock cuando llama a createClient()
            '@supabase/supabase-js': {
                createClient: sinon.stub().returns(mockSupabaseClient) 
            }
        });
        
        // Limpiar las respuestas simuladas del query builder antes de cada test
        // Esto es necesario para evitar interferencias entre pruebas
        mockQueryBuilder.single.reset();
        mockQueryBuilder.maybeSingle.reset();
        mockQueryBuilder.select.reset();
    });

    // Limpieza que se ejecuta después de cada test
    afterEach(() => {
        // Restaura todos los stubs y espías a sus implementaciones originales
        sinon.restore();
    });

    // ----------------------------------------------------------------
    // Prueba 1: Registro Exitoso
    // ----------------------------------------------------------------
    describe('POST /api/register', () => {
        
        it('Debe registrar un nuevo usuario y devolver 201', async () => {
            
            // 1. Configurar la PRIMERA consulta: Verificar que el usuario NO existe
            // Se asume que tu código usa .single() o .maybeSingle() para la verificación inicial.
            mockQueryBuilder.single.resolves({
                data: null, // No se encontró usuario existente
                error: null
            });
            
            // 2. Configurar la SEGUNDA consulta: La inserción exitosa
            // La llamada de inserción es: .insert([...]).select()
            // El último .select() debe devolver los datos insertados.
            mockQueryBuilder.select.resolves({
                data: [{ 
                    id: 1, // Añade el id para que la aserción final funcione
                    email: 'test@mail.com', 
                    username: 'tester', 
                    first_name: 'Test', 
                    last_name: 'User',
                    recovery_answer: 'hashed_password_mock' // Asumimos que se hashea
                }],
                error: null
            });

            const response = await request(app)
                .post('/api/register')
                .send({
                    email: 'test@mail.com',
                    username: 'tester',
                    password: 'password123',
                    firstName: 'Test',
                    lastName: 'User',
                    recoveryAnswer: 'Test answer'
                });

            // Afirmaciones
            expect(response.statusCode).to.equal(201);
            expect(response.body.success).to.be.true;
            expect(response.body.user).to.have.property('id', 1);
            // Verifica que bcrypt.hash se llamó dos veces (password y recoveryAnswer)
            expect(bcryptStub.calledTwice).to.be.true; 
        });

        // ----------------------------------------------------------------
        // Prueba 2: Datos de entrada inválidos
        // ----------------------------------------------------------------
        it('debe devolver 400 si la validación falla (ej. email inválido)', async () => {
            const response = await request(app)
                .post('/api/register')
                .send({
                    email: 'invalid-email', // Email inválido
                    username: 'test',
                    password: 'p', // Password muy corto
                    firstName: 'Test',
                    lastName: 'User',
                    recoveryAnswer: 'Test answer'
                });

            expect(response.statusCode).to.equal(400);
            expect(response.body.success).to.be.false;
            expect(response.body.errors).to.be.an('array').with.lengthOf.at.least(2);
        });

        // ----------------------------------------------------------------
        // Prueba 3: Usuario ya existe
        // ----------------------------------------------------------------
        it('debe devolver 400 si el email o username ya están en uso', async () => {
            // 1. Simular que el usuario SÍ existe
            // Esto solo afecta a la llamada .single() / .maybeSingle()
            mockQueryBuilder.single.resolves({
                data: { email: 'existing@mail.com', username: 'existing' },
                error: null
            });
            
            const response = await request(app)
                .post('/api/register')
                .send({
                    email: 'existing@mail.com',
                    username: 'existing',
                    password: 'password123',
                    firstName: 'Test',
                    lastName: 'User',
                    recoveryAnswer: 'Test answer'
                });

            expect(response.statusCode).to.equal(400);
            expect(response.body.success).to.be.false;
            expect(response.body.message).to.equal('El email o username ya está en uso');
        });
        
        // ----------------------------------------------------------------
        // Prueba 4: Fallo en la inserción de la base de datos
        // ----------------------------------------------------------------
        it('debe devolver 500 si la base de datos falla durante la inserción', async () => {
            // 1. Simular la no existencia
            mockQueryBuilder.single.resolves({ data: null, error: null });

            // 2. Simular el fallo de la BD en la inserción
            mockQueryBuilder.select.resolves({
                data: null,
                error: { message: 'Database constraint violation', code: '23505' }
            });

            const response = await request(app)
                .post('/api/register')
                .send({
                    email: 'fail@mail.com',
                    username: 'failer',
                    password: 'password123',
                    firstName: 'Test',
                    lastName: 'User',
                    recoveryAnswer: 'Test answer'
                });

            expect(response.statusCode).to.equal(500);
            expect(response.body.success).to.be.false;
            expect(response.body.message).to.equal('Error interno del servidor');
            // O, si tu código maneja el error de Supabase directamente:
            // expect(response.body.message).to.include('Database constraint violation'); 
        });
    });
});
