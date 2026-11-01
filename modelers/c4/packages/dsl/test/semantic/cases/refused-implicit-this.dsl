workspace {
    model {
        a = softwareSystem "A" {
            -> this "Loops"
        }
    }
}
