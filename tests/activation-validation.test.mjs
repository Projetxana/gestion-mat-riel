import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_PASSWORD_LENGTH, validateAccountActivation } from '../src/utils/activationValidation.js';

const valid = {
    enteredEmail: ' invitee@example.com ',
    sessionEmail: 'Invitee@example.com',
    password: 'abc123',
    confirmPassword: 'abc123',
};

test('password length is six characters minimum', () => {
    assert.equal(MIN_PASSWORD_LENGTH, 6);
    assert.equal(validateAccountActivation(valid), null);
    assert.equal(validateAccountActivation({ ...valid, password: 'abcdefg', confirmPassword: 'abcdefg' }), null);
});

test('passwords shorter than six characters are rejected', () => {
    assert.match(validateAccountActivation({ ...valid, password: 'abc12', confirmPassword: 'abc12' }), /au moins 6 caractères/);
});

test('a missing invitation session gives an actionable message', () => {
    assert.match(validateAccountActivation({ ...valid, sessionEmail: '' }), /Session absente/);
});

test('the invited email must match the authenticated email', () => {
    assert.match(validateAccountActivation({ ...valid, enteredEmail: 'admin@example.com' }), /Adresse différente/);
});

test('confirmation must match the chosen password', () => {
    assert.match(validateAccountActivation({ ...valid, confirmPassword: 'wrong1' }), /ne correspondent pas/);
});

test('missing input fields receive explicit feedback', () => {
    assert.match(validateAccountActivation({ ...valid, enteredEmail: '' }), /Saisissez l’adresse/);
    assert.match(validateAccountActivation({ ...valid, password: '' }), /Saisissez un nouveau/);
    assert.match(validateAccountActivation({ ...valid, confirmPassword: '' }), /Confirmez votre/);
});
