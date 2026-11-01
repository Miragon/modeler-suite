workspace {
    model {
        a = softwareSystem "A"
        a -> b "Uses"
        b = softwareSystem "B"
    }
}
