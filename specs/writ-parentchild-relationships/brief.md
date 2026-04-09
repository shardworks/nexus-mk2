# Writ Parent/Child Relationships

Today, writs support arbitrary relationships between each other via 'links'. We would like to add a more structured, explicit relationship as well between "parent" writs and "child" writs. Parent/Child relationships would form a DAG, with each child having zero or one parents, and parents having zero or more children. Parent and child writs can be of any type -- they do not have to be of the same type.

There is a natural relationship between the status of parents and children. The following list is illustrative and and not necessarily exhaustive--during planning, the full state machine of parent/child hierarchies should be explored and designed, and may contradict the explicit examples below if a better design is selected.

- Parent writs are in a 'pending' or 'waiting' state if they have any children in non-terminal states. (Use suitable existing state or introduce new one)
- If any child writs fail, then all siblings should be cancelled/abandoned/something, and the parent should be failed as well
- when all children for a parent are completed, the parent should transition from pending/waiting into the ready state
- etc

Wherever possible, the writ state transitions should use CDC so that parent/sibling transitions happen in the same transaction.
