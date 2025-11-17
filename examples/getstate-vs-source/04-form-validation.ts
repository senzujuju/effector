/**
 * Пример 4: Валидация формы - практический кейс
 *
 * Проблема: При валидации формы с getState() могут быть использованы
 * устаревшие значения полей, особенно при быстром вводе или
 * автоматическом заполнении.
 */

import { createStore, createEvent, createEffect, sample, combine } from 'effector'

// Сторы для полей формы регистрации
const $username = createStore('')
const $email = createStore('')
const $password = createStore('')
const $confirmPassword = createStore('')

const usernameChanged = createEvent<string>()
const emailChanged = createEvent<string>()
const passwordChanged = createEvent<string>()
const confirmPasswordChanged = createEvent<string>()

$username.on(usernameChanged, (_, value) => value)
$email.on(emailChanged, (_, value) => value)
$password.on(passwordChanged, (_, value) => value)
$confirmPassword.on(confirmPasswordChanged, (_, value) => value)

// Типы для валидации
type ValidationResult = {
  isValid: boolean
  errors: string[]
}

// Эффект для валидации (может быть асинхронным, например, проверка на сервере)
const validateFormFx = createEffect<
  {
    username: string
    email: string
    password: string
    confirmPassword: string
  },
  ValidationResult
>(async (formData) => {
  // Имитация асинхронной валидации
  await new Promise(resolve => setTimeout(resolve, 50))

  const errors: string[] = []

  if (formData.username.length < 3) {
    errors.push('Имя пользователя должно быть не менее 3 символов')
  }

  if (!formData.email.includes('@')) {
    errors.push('Некорректный email')
  }

  if (formData.password.length < 6) {
    errors.push('Пароль должен быть не менее 6 символов')
  }

  if (formData.password !== formData.confirmPassword) {
    errors.push('Пароли не совпадают')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
})

const submitForm = createEvent()

// ❌ НЕПРАВИЛЬНО: Использование getState()
const validateWithGetStateFx = createEffect<void, ValidationResult>(async () => {
  // ПРОБЛЕМА: Между вызовами getState() пользователь мог изменить поля!
  // Также возможна рассинхронизация, если поля обновляются быстро
  const username = $username.getState()
  const email = $email.getState()
  const password = $password.getState()
  const confirmPassword = $confirmPassword.getState()

  // К моменту передачи в validateFormFx значения могли устареть
  return validateFormFx({
    username,
    email,
    password,
    confirmPassword,
  })
})

sample({
  clock: submitForm,
  target: validateWithGetStateFx,
})

// ✅ ПРАВИЛЬНО: Использование source
// Создаем объединенный стор с формой
const $formData = combine({
  username: $username,
  email: $email,
  password: $password,
  confirmPassword: $confirmPassword,
})

// Используем source для передачи актуальных данных
sample({
  clock: submitForm,
  source: $formData,
  target: validateFormFx,
})

/**
 * Демонстрация проблемы:
 *
 * Сценарий: Пользователь быстро заполняет форму и нажимает Submit
 *
 * С getState():
 * - Между получением разных полей могут произойти изменения
 * - Валидация может использовать несогласованные данные
 * - При автозаполнении браузером особенно критично
 *
 * С source:
 * - Все поля получаются атомарно в момент срабатывания submitForm
 * - Гарантируется согласованность данных
 * - Валидация всегда использует актуальный снимок формы
 */
export const formValidationExample = {
  // Поля формы
  $username,
  $email,
  $password,
  $confirmPassword,
  $formData,

  // События изменения полей
  usernameChanged,
  emailChanged,
  passwordChanged,
  confirmPasswordChanged,

  // Отправка формы
  submitForm,

  // Эффекты валидации
  validateWithGetStateFx,
  validateFormFx,
}
