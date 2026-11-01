workspace {
    model {
        a = softwareSystem "A"
        b = softwareSystem "B"
    }
    views {
        dynamic * "Steps" {
            a -> b "Calls"
        }
    }
}
