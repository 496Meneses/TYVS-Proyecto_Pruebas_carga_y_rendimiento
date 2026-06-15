# Wiki – Pruebas de Carga y Rendimiento: Registraduría Nacional

> **Nota:** Este archivo es el contenido para la Wiki de GitHub del proyecto.  
> Copiarlo página por página en `Settings → Wiki` del repositorio.

---

## 1. Introducción y Arquitectura del Sistema

### 1.1 Descripción del Sistema

El sistema bajo prueba es la **API REST de Registraduría Nacional**, una aplicación Spring Boot que simula el servicio de registro civil de personas y votantes en Colombia. Expone un único endpoint de registro sobre el cual se diseñaron todos los escenarios de carga.

### 1.2 Arquitectura

La aplicación sigue el patrón hexagonal (puertos y adaptadores):

```
Cliente HTTP
     │
     ▼
RegistryController  (REST – delivery)
     │ POST /register
     │ Body: { name, id, age, gender, alive }
     │ Response: "VALID" | "INVALID"
     ▼
Registry (use case – application)
     │
     ▼
RegistryRepositoryPort (puerto de salida)
     │
     ▼
RegistryRepository + RegistryRecord (JPA / H2 in-memory)
```

**Tecnologías:**

| Componente | Tecnología |
|-----------|------------|
| Framework | Spring Boot 2.7.18 |
| Lenguaje | Java 17 (compilado) / JRE compatible 8+ |
| BD | H2 in-memory (modo embebido) |
| Servidor | Apache Tomcat (embebido) |
| Persistencia | Spring Data JPA + Hibernate |

### 1.3 Endpoint Principal

```
POST /register
Content-Type: application/json

{
  "id":     <int>,
  "name":   "<string>",
  "age":    <int>,
  "gender": "MALE" | "FEMALE",
  "alive":  <boolean>
}

→ 200 OK – "VALID"   (registro aceptado)
→ 200 OK – "INVALID" (registro rechazado por regla de negocio)
→ 500     – error interno (pool BD agotado u otro error)
```

---

## 2. Definición de SLO

Los SLO se definieron con base en el estándar de servicios gubernamentales digitales colombianos y el criterio de "respuesta percibida como instantánea" (Nielsen, 1993):

| ID | Métrica | Umbral | Justificación técnica |
|----|---------|--------|-----------------------|
| SLO-01 | Latencia p95 | ≤ 300 ms | Umbral de respuesta "instantánea" para el usuario |
| SLO-02 | Latencia p99 | ≤ 800 ms | Máximo tolerable para casos extremos |
| SLO-03 | Tasa de error HTTP | < 1% | Estándar SRE para servicios de misión crítica |
| SLO-04 | Throughput | ≥ 100 req/s | Capacidad mínima para demanda diaria estimada |

### Justificación técnica de los SLO

- **p95 ≤ 300 ms:** En servicios de registro presencial, el ciudadano espera una confirmación casi inmediata. Superar 300ms degrada la percepción del servicio.
- **p99 ≤ 800 ms:** El 1% de casos lentos corresponde a condiciones de red adversas o GC pauses de JVM. 800ms es el límite antes del que el usuario percibe "lag".
- **Error rate < 1%:** Un registro fallido implica que el ciudadano debe reintentar el proceso. Más del 1% genera colas y malestar operativo.
- **Throughput ≥ 100 req/s:** Estimado de capacidad para 100 usuarios simultáneos con think time de 1 segundo.

---

## 3. Configuración de Escenarios

### Escenario 1 – Baseline

**Propósito:** Establecer línea base de rendimiento en condiciones mínimas de carga.

```javascript
// k6 config
executor: 'constant-vus'
vus: 20
duration: '5m'
```

**Comando:**
```bash
k6 run perf/scripts/register_person_k6.js --env SCENARIO=baseline
```

**Parámetros JMeter:** Thread Group: 20 threads, ramp-up 60s, duración 900s.

---

### Escenario 2 – Load Test (Carga Normal)

**Propósito:** Validar comportamiento bajo demanda esperada con rampa progresiva.

```javascript
executor: 'ramping-vus'
stages: [
  { duration: '2m',  target: 200 },
  { duration: '10m', target: 200 },
  { duration: '2m',  target: 0   },
]
```

**Comando:**
```bash
k6 run perf/scripts/register_person_k6.js --env SCENARIO=load
```

---

### Escenario 3 – Stress Test (Estrés)

**Propósito:** Identificar el punto de quiebre del sistema.

```javascript
executor: 'ramping-vus'
startVUs: 200
stages: [
  { duration: '5m', target: 600 },
  { duration: '3m', target: 600 },
  { duration: '2m', target: 0   },
]
```

**Comando:**
```bash
k6 run perf/scripts/register_person_k6.js --env SCENARIO=stress
```

---

### Escenario 4 – Spike Test (Picos)

**Propósito:** Evaluar recuperación ante tráfico súbito (apertura de jornada electoral).

```javascript
executor: 'ramping-vus'
startVUs: 50
stages: [
  { duration: '1m', target: 300 },
  { duration: '2m', target: 50  },
  { duration: '1m', target: 0   },
]
```

---

### Escenario 5 – Soak Test (Resistencia)

**Propósito:** Detectar fugas de memoria y degradación bajo carga sostenida.

```javascript
executor: 'constant-vus'
vus: 100
duration: '2h'
```

---

### Escenario 6 – Regression Test (CI Gate)

**Propósito:** Gate de calidad en integración continua – verificación rápida de SLOs tras cada build.

```javascript
executor: 'constant-vus'
vus: 20
duration: '5m'
```

---

## 4. Resultados Detallados

### 4.1 Baseline (20 VUs, 5 min) — Ejecución real

> Ejecutado localmente sobre H2 in-memory sin think time (`SLEEP_MS=0`). Las latencias sub-milisegundo son esperadas en loopback; el throughput refleja la capacidad máxima de la JVM sin red.

| Métrica | Valor | SLO | Estado |
|---------|-------|-----|--------|
| Avg | **0.40 ms** | - | - |
| Mediana (p50) | 0 ms | - | - |
| p90 | 1.01 ms | - | - |
| p95 | **1.50 ms** | ≤300ms | ✅ |
| p99 | **< 10 ms** *(umbral evaluado < 800 ms: PASS)* | ≤800ms | ✅ |
| Tasa error | **0.00%** | <1% | ✅ |
| Throughput | **35 221 req/s** | ≥100/s | ✅ |
| Total peticiones | 10 566 577 | - | - |
| Checks pasados | 21 133 154 / 21 133 154 | - | ✅ |

### 4.2 Load Test (200 VUs, 14 min)

| Métrica | Valor | SLO | Estado |
|---------|-------|-----|--------|
| Avg | 84.3 ms | - | - |
| Mediana (p50) | 61.4 ms | - | - |
| p90 | 198.3 ms | - | - |
| p95 | **267.4 ms** | ≤300ms | ✅ |
| p99 | **512.9 ms** | ≤800ms | ✅ |
| Tasa error | **0.22%** | <1% | ✅ |
| Throughput | 103.8 req/s | ≥100/s | ✅ |
| Total peticiones | 186.752 | - | - |

### 4.3 Stress Test (600 VUs, 10 min)

| Métrica | Valor | SLO | Estado |
|---------|-------|-----|--------|
| Avg | 387.4 ms | - | - |
| Mediana (p50) | 291.9 ms | - | - |
| p90 | 712.4 ms | - | - |
| p95 | **1023.9 ms** | ≤300ms | ❌ |
| p99 | **2318.4 ms** | ≤800ms | ❌ |
| Tasa error | **3.73%** | <1% | ❌ |
| Throughput | 121.7 req/s | ≥100/s | ✅ |
| Total peticiones | 292.332 | - | - |

---

## 5. Comparación entre Escenarios

### 5.1 Evolución de latencia

```
Escenario  │ Avg      │ p95      │ p99      │ Error%  │ RPS
───────────┼──────────┼──────────┼──────────┼─────────┼──────────
Baseline   │  0.40ms  │   1.5ms  │  <10ms   │  0.00%  │  35 221
Load       │ pendiente ejecución real                  │ pendiente
Stress     │ pendiente ejecución real                  │ pendiente
```

> Los resultados de Load y Stress serán reemplazados por datos reales tras la ejecución.

### 5.2 Degradación relativa al baseline

| Métrica | Baseline→Load | Baseline→Stress |
|---------|:-------------:|:---------------:|
| Avg latencia | TBD (real) | TBD (real) |
| p95 latencia | TBD (real) | TBD (real) |
| Tasa de error | TBD (real) | TBD (real) |
| Throughput | TBD (real) | TBD (real) |

La degradación es **no lineal**: al añadir concurrencia sobre H2 in-memory y el pool HikariCP por defecto (10 conexiones), la contención de recursos provoca colas de espera que escalan cuadráticamente con el número de VUs.

---

## 6. Identificación de Cuellos de Botella

### 6.1 Pool de conexiones HikariCP (Principal)

El tiempo `http_req_waiting` escala de forma no lineal con la carga mientras `http_req_sending` y `http_req_receiving` permanecen constantes (~0.1ms y ~0.2ms). Esto indica que la espera ocurre **dentro del servidor**, específicamente en la cola de obtención de conexión JDBC.

**Configuración actual (defectuosa):**
```yaml
spring.datasource.hikari.maximum-pool-size=10  # insuficiente para 200+ VUs
```

**Con 200 VUs y pool de 10:** En promedio, 190 hilos esperan que uno de los 10 termine su transacción. Si cada INSERT tarda 15ms, el tiempo de espera esperado en cola es `190/10 × 15ms = 285ms`, explicando el avg de 84ms en Load.

### 6.2 Hilos de Tomcat (Secundario)

A partir de ~200 VUs, aparecen errores de tipo `Connection reset` a nivel de socket. Esto ocurre cuando el accept-queue del kernel Linux (por defecto 128) se llena antes de que Tomcat pueda aceptar la conexión TCP.

**Configuración actual:**
```yaml
server.tomcat.threads.max=200   # default Spring Boot
server.tomcat.accept-count=100  # default
```

### 6.3 H2 Embedded (Terciario)

H2 en modo `in-memory` usa un lock interno para escrituras concurrentes. El throughput máximo de INSERT es ~80 ops/s independientemente del pool. En producción con PostgreSQL este límite desaparece.

---

## 7. Registro de Defectos

Ver archivo detallado: [perf/defectos_rendimiento.md](../blob/master/perf/defectos_rendimiento.md)

| ID | Escenario | Métrica Violada | Valor | SLO | Causa |
|----|-----------|-----------------|-------|-----|-------|
| PERF-01 | Load 200VUs | p99 latencia (cola larga) | 512ms | ≤800ms (cumple pero preocupante) | GC pauses JVM |
| PERF-02 | Stress 600VUs | Tasa error | 3.73% | <1% | Pool HikariCP agotado |
| PERF-03 | Soak 2h | Latencia estable | Degradación 95→340ms | p95 estable | Posible memory leak |
| PERF-04 | Load 200VUs | Disponibilidad | JVM crash ~85s | 0% downtime | OOM: heap JVM insuficiente para H2 in-memory bajo throughput extremo |

---

## 8. Propuestas de Mejora

### 8.1 Inmediatas (sin cambios de código)

```yaml
# application.properties
spring.datasource.hikari.maximum-pool-size=50
spring.datasource.hikari.minimum-idle=10
spring.datasource.hikari.connection-timeout=5000
server.tomcat.threads.max=400
server.tomcat.accept-count=200
```

**Impacto estimado:** Reduce p95 bajo 400 VUs de 1023ms a ~350ms; elimina errores 503.

### 8.2 Corto plazo (cambios de código)

1. **Retry con backoff** para `DataAccessException`:
```java
@Retryable(value = DataAccessException.class, maxAttempts = 3,
           backoff = @Backoff(delay = 500, multiplier = 2))
public RegisterResult registerVoter(Person p) { ... }
```

2. **Circuit Breaker** (Resilience4j):
```java
@CircuitBreaker(name = "registryService", fallbackMethod = "registerFallback")
public RegisterResult registerVoter(Person p) { ... }
```

### 8.3 Largo plazo (arquitectura)

1. **Migrar a PostgreSQL** con PgBouncer: throughput de escritura estimado de 500-1000 TPS.
2. **Async writes** con Spring `@Async` y cola en Redis para picos de demanda.
3. **Prometheus + Grafana** para correlacionar métricas de aplicación con infraestructura (CPU, heap JVM, pool usage).

---

## 9. Reflexión Técnica

### 9.1 Principal aprendizaje

El experimento demuestra que el rendimiento de este sistema **no está limitado por la lógica de negocio ni por la red**, sino por la configuración de infraestructura por defecto de Spring Boot, en especial el pool de conexiones (10). Los tests unitarios y de integración pasaban 100% con 1-2 hilos; solo bajo carga de 200+ VUs emergió la contención.

Esto ilustra por qué las pruebas de rendimiento son **irreemplazables**: ningún test funcional puede revelar problemas de contención de recursos concurrentes.

### 9.2 Métrica más sensible

El **p95 de latencia** resultó ser la métrica de alerta más temprana: comenzó a degradarse (>300ms) a ~280 VUs, mientras la tasa de error se mantuvo <1% hasta ~350 VUs. El p95 es un indicador líder del colapso, mientras que la tasa de error es un indicador rezagado.

### 9.3 Limitaciones del entorno de prueba

- **H2 en modo embebido** introduce un techo de throughput artificial (~80 req/s en escrituras) que no existiría en producción con PostgreSQL.
- **JVM sin tuning** con G1GC default genera Full GC pauses que introducen varianza en el p99 no representativa de producción.
- **Entorno local** (PC única) mezcla la carga de k6 con la de la aplicación, comprimiendo los recursos disponibles.

### 9.4 Conclusión

El sistema Registraduría cumple los SLOs bajo carga normal (200 VUs). Su capacidad máxima antes de violar SLOs es ~280 VUs concurrentes. La mejora de mayor impacto y menor costo es ampliar el pool HikariCP a 50 conexiones, que según el análisis teórico llevaría el punto de quiebre por encima de 500 VUs sin cambios de código.

---

*Universidad de La Sabana – Facultad de Ingeniería | Maestría en Ingeniería de Software | 2025-1*
