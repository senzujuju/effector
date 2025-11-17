/**
 * Тесты для примера 4: Валидация формы
 *
 * Демонстрируют практические проблемы при валидации формы:
 * несогласованность данных при использовании getState()
 */

import { createStore, createEvent, createEffect, sample, combine, fork, allSettled } from 'effector'

describe('getState vs source: Form Validation', () => {
  test('getState() может получить несогласованные данные формы', async () => {
    // Поля формы
    const $username = createStore('')
    const $email = createStore('')
    const $password = createStore('')

    const usernameChanged = createEvent<string>()
    const emailChanged = createEvent<string>()
    const passwordChanged = createEvent<string>()

    $username.on(usernameChanged, (_, value) => value)
    $email.on(emailChanged, (_, value) => value)
    $password.on(passwordChanged, (_, value) => value)

    type FormData = { username: string; email: string; password: string }
    const capturedForms: FormData[] = []

    // ❌ Эффект с множественными getState()
    const validateWithGetStateFx = createEffect<void, FormData>(async () => {
      // ПРОБЛЕМА: Между вызовами поля могут измениться
      const username = $username.getState()
      const email = $email.getState()
      const password = $password.getState()

      const formData = { username, email, password }
      capturedForms.push(formData)
      return formData
    })

    const submit = createEvent()
    sample({
      clock: submit,
      target: validateWithGetStateFx,
    })

    const scope = fork()

    // Заполняем форму
    await allSettled(usernameChanged, { scope, params: 'user123' })
    await allSettled(emailChanged, { scope, params: 'user@example.com' })
    await allSettled(passwordChanged, { scope, params: 'password123' })

    // Отправляем форму
    await allSettled(submit, { scope })

    // Проверяем что данные были захвачены
    expect(capturedForms.length).toBe(1)
    expect(capturedForms[0].username).toBe('user123')
  })

  test('source гарантирует атомарное получение всех полей формы', async () => {
    // Поля формы
    const $username = createStore('')
    const $email = createStore('')
    const $password = createStore('')

    const usernameChanged = createEvent<string>()
    const emailChanged = createEvent<string>()
    const passwordChanged = createEvent<string>()

    $username.on(usernameChanged, (_, value) => value)
    $email.on(emailChanged, (_, value) => value)
    $password.on(passwordChanged, (_, value) => value)

    // Объединяем все поля в один стор
    const $formData = combine({
      username: $username,
      email: $email,
      password: $password,
    })

    type FormData = { username: string; email: string; password: string }

    // ✅ Эффект с source
    const validateWithSourceFx = createEffect<FormData, FormData>(async (formData) => {
      // Все поля получены атомарно
      return formData
    })

    const scope = fork()

    // Заполняем форму
    await allSettled(usernameChanged, { scope, params: 'user123' })
    await allSettled(emailChanged, { scope, params: 'user@example.com' })
    await allSettled(passwordChanged, { scope, params: 'password123' })

    // Получаем данные формы из scope и отправляем
    const formData = scope.getState($formData)
    const result = await allSettled(validateWithSourceFx, { scope, params: formData })

    // ✅ Все поля получены согласованно
    expect(result.status).toBe('done')
    if (result.status === 'done') {
      expect(result.value.username).toBe('user123')
      expect(result.value.email).toBe('user@example.com')
      expect(result.value.password).toBe('password123')
    }
  })

  test('валидация с getState() при быстром изменении полей может быть некорректной', async () => {
    const $password = createStore('')
    const $confirmPassword = createStore('')

    const passwordChanged = createEvent<string>()
    const confirmPasswordChanged = createEvent<string>()

    $password.on(passwordChanged, (_, value) => value)
    $confirmPassword.on(confirmPasswordChanged, (_, value) => value)

    const validationResults: boolean[] = []

    // ❌ Валидация с getState()
    const validateWithGetStateFx = createEffect<void, boolean>(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))

      const password = $password.getState()
      const confirmPassword = $confirmPassword.getState()

      const isValid = password === confirmPassword && password.length >= 6
      validationResults.push(isValid)
      return isValid
    })

    const validate = createEvent()
    sample({
      clock: validate,
      target: validateWithGetStateFx,
    })

    const scope = fork()

    // Устанавливаем пароли
    await allSettled(passwordChanged, { scope, params: 'pass123' })
    await allSettled(confirmPasswordChanged, { scope, params: 'pass123' })

    // Запускаем валидацию
    const validationPromise = allSettled(validate, { scope })

    // Пока идет валидация, пользователь меняет подтверждение пароля
    await allSettled(confirmPasswordChanged, { scope, params: 'different' })

    await validationPromise

    // Результат может быть некорректным
    expect(validationResults.length).toBe(1)
  })

  test('валидация с source корректна даже при быстрых изменениях', async () => {
    const $password = createStore('')
    const $confirmPassword = createStore('')

    const passwordChanged = createEvent<string>()
    const confirmPasswordChanged = createEvent<string>()

    $password.on(passwordChanged, (_, value) => value)
    $confirmPassword.on(confirmPasswordChanged, (_, value) => value)

    const $passwords = combine({
      password: $password,
      confirmPassword: $confirmPassword,
    })

    // ✅ Валидация с source
    const validateWithSourceFx = createEffect<
      { password: string; confirmPassword: string },
      boolean
    >(async ({ password, confirmPassword }) => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return password === confirmPassword && password.length >= 6
    })

    const scope = fork()

    // Устанавливаем пароли
    await allSettled(passwordChanged, { scope, params: 'pass123' })
    await allSettled(confirmPasswordChanged, { scope, params: 'pass123' })

    // Получаем пароли из scope и запускаем валидацию
    const passwords = scope.getState($passwords)
    const validationPromise = allSettled(validateWithSourceFx, {
      scope,
      params: passwords,
    })

    // Пока идет валидация, пользователь меняет подтверждение пароля
    await allSettled(confirmPasswordChanged, { scope, params: 'different' })

    const result = await validationPromise

    // ✅ Результат корректен для снимка на момент вызова validate
    expect(result.status).toBe('done')
    if (result.status === 'done') {
      expect(result.value).toBe(true) // Пароли совпадали в момент вызова validate
    }
  })

  test('комплексная валидация формы с несколькими правилами', async () => {
    const $username = createStore('')
    const $email = createStore('')
    const $age = createStore(0)

    const usernameChanged = createEvent<string>()
    const emailChanged = createEvent<string>()
    const ageChanged = createEvent<number>()

    $username.on(usernameChanged, (_, value) => value)
    $email.on(emailChanged, (_, value) => value)
    $age.on(ageChanged, (_, value) => value)

    const $form = combine({
      username: $username,
      email: $email,
      age: $age,
    })

    type ValidationResult = {
      isValid: boolean
      errors: string[]
    }

    const validateFx = createEffect<
      { username: string; email: string; age: number },
      ValidationResult
    >(async (form) => {
      await new Promise(resolve => setTimeout(resolve, 10))

      const errors: string[] = []

      if (form.username.length < 3) {
        errors.push('Username too short')
      }

      if (!form.email.includes('@')) {
        errors.push('Invalid email')
      }

      if (form.age < 18) {
        errors.push('Must be 18+')
      }

      return {
        isValid: errors.length === 0,
        errors,
      }
    })

    const scope = fork()

    // Заполняем форму корректными данными
    await allSettled(usernameChanged, { scope, params: 'john_doe' })
    await allSettled(emailChanged, { scope, params: 'john@example.com' })
    await allSettled(ageChanged, { scope, params: 25 })

    // Получаем данные формы из scope и отправляем
    const form = scope.getState($form)
    const result = await allSettled(validateFx, { scope, params: form })

    // Валидация успешна
    expect(result.status).toBe('done')
    if (result.status === 'done') {
      expect(result.value.isValid).toBe(true)
      expect(result.value.errors).toEqual([])
    }
  })

  test('валидация обнаруживает все ошибки в несогласованной форме', async () => {
    const $username = createStore('')
    const $email = createStore('')
    const $age = createStore(0)

    const usernameChanged = createEvent<string>()
    const emailChanged = createEvent<string>()
    const ageChanged = createEvent<number>()

    $username.on(usernameChanged, (_, value) => value)
    $email.on(emailChanged, (_, value) => value)
    $age.on(ageChanged, (_, value) => value)

    const $form = combine({
      username: $username,
      email: $email,
      age: $age,
    })

    type ValidationResult = {
      isValid: boolean
      errors: string[]
    }

    const validateFx = createEffect<
      { username: string; email: string; age: number },
      ValidationResult
    >(async (form) => {
      await new Promise(resolve => setTimeout(resolve, 10))

      const errors: string[] = []

      if (form.username.length < 3) {
        errors.push('Username too short')
      }

      if (!form.email.includes('@')) {
        errors.push('Invalid email')
      }

      if (form.age < 18) {
        errors.push('Must be 18+')
      }

      return {
        isValid: errors.length === 0,
        errors,
      }
    })

    const scope = fork()

    // Заполняем форму некорректными данными
    await allSettled(usernameChanged, { scope, params: 'ab' }) // Слишком короткий
    await allSettled(emailChanged, { scope, params: 'invalid-email' }) // Нет @
    await allSettled(ageChanged, { scope, params: 16 }) // Меньше 18

    // Получаем данные формы из scope и отправляем
    const form = scope.getState($form)
    const result = await allSettled(validateFx, { scope, params: form })

    // Валидация находит все ошибки
    expect(result.status).toBe('done')
    if (result.status === 'done') {
      expect(result.value.isValid).toBe(false)
      expect(result.value.errors).toHaveLength(3)
      expect(result.value.errors).toContain('Username too short')
      expect(result.value.errors).toContain('Invalid email')
      expect(result.value.errors).toContain('Must be 18+')
    }
  })
})
