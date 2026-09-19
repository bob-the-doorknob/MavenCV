# Trajectory Domain Glossary

## Target Role

A career outcome selected by a student and represented by one roadmap. It has a
role title and may name a specific employer. A user may store several target
roles, but exactly one is active in the mobile UI at a time.

## Roadmap

The ordered collection of measurable tasks associated with one target role.

## Roadmap Task

A verifiable career milestone with a positive weight and one status:
`not_started`, `in_progress`, or `done`. It may hold student notes and records a
completion timestamp when done.

## Readiness Score

An integer percentage calculated as the sum of weights for completed roadmap
tasks divided by the sum of weights for all roadmap tasks, multiplied by 100.
An empty roadmap has a readiness score of zero.

## Active Target Role

The target role whose roadmap is currently shown. The active role is identified
by ID rather than by its position in the stored target-role collection.

## Pro Entitlement

The active RevenueCat entitlement named `pro`. It will eventually permit
multiple concurrent target roles and unlimited CV-line exports.

## CV Entry

A resume bullet generated from one completed roadmap task and the student's
notes. It is stored separately from the task and references its source task ID.
