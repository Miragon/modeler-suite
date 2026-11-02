workspace {
    model {
        a = softwareSystem "A"
    }
    views {
        systemContext a "Context" "The new one." {
            include *
            autoLayout tb 300 160
        }
    }
}
