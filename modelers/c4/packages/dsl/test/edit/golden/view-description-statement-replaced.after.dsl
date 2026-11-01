workspace {
    model {
        a = softwareSystem "A"
    }
    views {
        systemContext a "Context" "Shadowed." {
            include *
            description "The new one."
            autoLayout tb 300 160
        }
    }
}
